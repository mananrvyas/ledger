import "server-only";
import twilio from "twilio";
import type { Twilio } from "twilio";

/**
 * Twilio SDK wrapper. Sandbox is the indefinitely-supported tier for one user
 * (decision in 00-overview.md / STATUS.md). Templates aren't enforced in
 * sandbox so we can send free-form bodies; outside sandbox we'd need approved
 * utility templates and would set `contentSid` + `contentVariables` instead.
 *
 * The Twilio Account SID + Auth Token must be the LIVE values, not the
 * test credentials — test creds only work with magic test phone numbers and
 * cannot send real WhatsApp messages.
 */

let cached: Twilio | null = null;

export function getTwilioClient(): Twilio {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
  }
  cached = twilio(sid, token);
  return cached;
}

/** Sandbox sender, e.g. `whatsapp:+14155238886`. Set in env. */
export function getWhatsAppFrom(): string {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) throw new Error("TWILIO_WHATSAPP_FROM not set");
  return from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
}

/** Format a stored phone number (E.164 like `+15551234567`) for WhatsApp. */
export function formatWhatsAppRecipient(phoneE164: string): string {
  return phoneE164.startsWith("whatsapp:")
    ? phoneE164
    : `whatsapp:${phoneE164}`;
}

export type SendWhatsAppParams = {
  /** Recipient in E.164 (`+15551234567`) or `whatsapp:+1...`. */
  to: string;
  body: string;
  /** Optional Twilio MessagingService / status callback URL. */
  statusCallback?: string;
};

export type SendWhatsAppResult = {
  sid: string;
  /** WhatsApp `wamid` if provided in metadata; used in P4 for quote-reply matching. */
  providerMessageId: string | null;
  status: string;
  raw: Record<string, unknown>;
};

/**
 * Send a free-form WhatsApp message via the Twilio sandbox. Throws on any
 * Twilio error so the QStash retry kicks in.
 */
export async function sendWhatsAppMessage(
  params: SendWhatsAppParams,
): Promise<SendWhatsAppResult> {
  const client = getTwilioClient();
  const from = getWhatsAppFrom();
  const to = formatWhatsAppRecipient(params.to);

  const message = await client.messages.create({
    from,
    to,
    body: params.body,
    statusCallback: params.statusCallback,
  });

  return {
    sid: message.sid,
    providerMessageId: extractWamid(message),
    status: message.status ?? "queued",
    raw: serializeMessage(message),
  };
}

function extractWamid(m: unknown): string | null {
  if (typeof m !== "object" || m === null) return null;
  const messagingServiceSid = (m as { messagingServiceSid?: unknown }).messagingServiceSid;
  if (typeof messagingServiceSid === "string" && messagingServiceSid.startsWith("wamid")) {
    return messagingServiceSid;
  }
  return null;
}

function serializeMessage(m: unknown): Record<string, unknown> {
  if (typeof m !== "object" || m === null) return {};
  const obj = m as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "function") continue;
    if (v === undefined) continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null
    ) {
      out[k] = v;
    } else if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (typeof v === "object") {
      try {
        JSON.stringify(v);
        out[k] = v;
      } catch {
        // skip un-serializable
      }
    }
  }
  return out;
}
