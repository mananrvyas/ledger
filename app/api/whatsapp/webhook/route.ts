import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishJob } from "@/lib/qstash";
import { findUserByWhatsAppNumber } from "@/lib/profile";
import type { Json, TablesUpdate } from "@/lib/database.types";
import twilio from "twilio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Twilio WhatsApp inbound + status-callback webhook.
 *
 * Two distinct payload shapes hit this endpoint:
 *
 *   1. Inbound message      — has `Body` and/or `NumMedia`. Persist as
 *      whatsapp_messages(direction='inbound') and enqueue parse_wa_reply.
 *
 *   2. Status callback      — has `MessageSid` + `MessageStatus` (no Body).
 *      Update the matching outbound row's status (sent / delivered / read /
 *      failed). No queue work needed.
 *
 * Signature verification: HMAC-SHA1 of (full URL + sorted POST params),
 * compared against the X-Twilio-Signature header. Twilio's helper does the
 * exact byte-level steps so we use it directly.
 *
 * We always return 200 (with empty TwiML) on logical issues — Twilio retries
 * 5xx and we don't want it pummeling the endpoint while we debug.
 */

const TWIML_OK = `<?xml version="1.0" encoding="UTF-8"?><Response/>`;

function twimlResponse(): Response {
  return new Response(TWIML_OK, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function getWebhookUrl(request: NextRequest): string {
  // Twilio signs against the URL it POSTed to. In production that's the
  // canonical APP_URL; locally we accept the request URL Next.js sees so
  // tunneled (ngrok / cloudflared) dev still verifies.
  const explicit = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (explicit) {
    const base = explicit.startsWith("http") ? explicit : `https://${explicit}`;
    return `${base.replace(/\/+$/, "")}/api/whatsapp/webhook`;
  }
  return request.url;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    // Misconfiguration — don't leak details, just 500. Twilio will retry,
    // and the alarm noise will make us notice.
    return Response.json({ error: "twilio_not_configured" }, { status: 500 });
  }

  // Twilio sends application/x-www-form-urlencoded.
  const rawBody = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody).entries()) {
    params[k] = v;
  }

  const url = getWebhookUrl(request);

  if (!signature || !twilio.validateRequest(authToken, signature, url, params)) {
    // Log + 401. We never reveal which check failed (signature vs missing
    // header) — both look the same to attackers.
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  // ---------------------------------------------------------------------
  // Status callback path: MessageSid present, no Body, has MessageStatus.
  // ---------------------------------------------------------------------
  const messageStatus = params["MessageStatus"];
  const messageSid = params["MessageSid"];
  const isStatusCallback =
    !!messageStatus && !!messageSid && !params["Body"] && !params["NumMedia"];

  if (isStatusCallback) {
    await handleStatusCallback({
      sid: messageSid,
      status: messageStatus,
      errorCode: params["ErrorCode"] ?? null,
      errorMessage: params["ErrorMessage"] ?? null,
    });
    return twimlResponse();
  }

  // ---------------------------------------------------------------------
  // Inbound message path
  // ---------------------------------------------------------------------
  // Resolve user by the sender's WhatsApp number (Twilio sends `From` as
  // `whatsapp:+15551234567`). Each user stores their own phone in
  // `profiles.whatsapp_number`, so this is the multi-user routing key.
  // Drop silently if no user owns this number — most likely a stranger
  // who somehow found our sandbox endpoint, or a user who hasn't completed
  // onboarding yet.
  const fromField = params["From"] ?? "";
  const userId = await findUserByWhatsAppNumber(fromField);
  if (!userId) {
    return twimlResponse();
  }

  const admin = createAdminClient();
  const body = params["Body"] ?? null;
  const inReplyToSid = params["OriginalRepliedMessageSid"] ?? null;

  // Idempotency: if Twilio re-delivers the same MessageSid, don't double-process.
  if (messageSid) {
    const { data: existing } = await admin
      .from("whatsapp_messages")
      .select("id, intent")
      .eq("twilio_message_sid", messageSid)
      .eq("direction", "inbound")
      .maybeSingle();
    if (existing) {
      // Already enqueued / processed — ack and exit.
      return twimlResponse();
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from("whatsapp_messages")
    .insert({
      user_id: userId,
      direction: "inbound",
      body,
      twilio_message_sid: messageSid ?? null,
      in_reply_to_sid: inReplyToSid,
      status: "received",
      raw: params as unknown as Json,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // Surface the failure to Twilio so it retries — this is unexpected.
    return Response.json(
      { error: `inbound_insert_failed: ${insertErr?.message ?? "missing"}` },
      { status: 500 },
    );
  }

  await publishJob({
    type: "parse_wa_reply",
    idempotency_key: `parse-wa-${inserted.id}`,
    payload: { whatsapp_message_id: inserted.id },
  });

  return twimlResponse();
}

async function handleStatusCallback(params: {
  sid: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
}): Promise<void> {
  const admin = createAdminClient();

  // Map Twilio statuses to ours. Twilio: queued|sent|delivered|read|failed|undelivered
  const mapped =
    params.status === "delivered"
      ? "delivered"
      : params.status === "read"
        ? "read"
        : params.status === "failed" || params.status === "undelivered"
          ? "failed"
          : params.status === "sent"
            ? "sent"
            : params.status; // pass through anything new (e.g. "accepted")

  const update: TablesUpdate<"whatsapp_messages"> = { status: mapped };
  if (params.errorMessage || params.errorCode) {
    update.error = [params.errorCode, params.errorMessage].filter(Boolean).join(" ");
  }

  await admin
    .from("whatsapp_messages")
    .update(update)
    .eq("twilio_message_sid", params.sid);
}

