import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/twilio";
import { parseWhatsAppIntent, type Intent } from "@/lib/intent";
import { upsertCategoryRule } from "@/lib/categorize";
import { formatCurrency } from "@/lib/format";
import type { Json } from "@/lib/database.types";

/**
 * Inbound WhatsApp reply worker. Pipeline:
 *   1. Load the inbound whatsapp_messages row (idempotent — skip if intent set).
 *   2. Resolve target transaction:
 *        a. quoted reply  → look up outbound row by Twilio's OriginalRepliedMessageSid
 *        b. fallback      → user's most-recent notified, un-edited tx within 60 min
 *        c. otherwise     → ask "which transaction?" and exit
 *   3. Download any media (Twilio basic auth) → upload to Storage → insert
 *      transaction_attachments rows.
 *   4. If body is non-empty: run the intent parser.
 *   5. Apply the intent (DB writes: user_category / split_* / notes / excluded_from_stats).
 *   6. Send a confirmation message via Twilio.
 *   7. Stamp the inbound row with intent + parsed_payload + related_transaction_id.
 *
 * Failure model: throws on transient (network/Twilio/Anthropic) so QStash retries;
 * returns `{ skipped: true }` on idempotent re-runs and benign no-ops.
 */

const RECENT_WINDOW_MIN = 60;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB

export type ParseWaReplyResult =
  | { ok: true; skipped: true; reason: string }
  | {
      ok: true;
      skipped?: false;
      transaction_id: string | null;
      intent: Intent["intent"];
      attachments_added: number;
    };

export async function parseWaReplyHandler(payload: {
  whatsapp_message_id: string;
}): Promise<ParseWaReplyResult> {
  const admin = createAdminClient();

  // ---------------------------------------------------------------------
  // 1. Load inbound row + idempotency check
  // ---------------------------------------------------------------------
  const { data: inbound, error: inboundErr } = await admin
    .from("whatsapp_messages")
    .select("id, user_id, body, in_reply_to_sid, raw, intent, related_transaction_id")
    .eq("id", payload.whatsapp_message_id)
    .maybeSingle();

  if (inboundErr || !inbound) {
    return { ok: true, skipped: true, reason: `inbound_not_found: ${inboundErr?.message ?? "missing"}` };
  }
  if (inbound.intent) {
    return { ok: true, skipped: true, reason: "already_processed" };
  }

  const userId = inbound.user_id;
  const body = (inbound.body ?? "").trim();
  const raw = (inbound.raw ?? {}) as Record<string, unknown>;

  // ---------------------------------------------------------------------
  // 2. Resolve target transaction
  // ---------------------------------------------------------------------
  let targetTxId: string | null = null;

  // 2a. Quoted-reply path
  if (inbound.in_reply_to_sid) {
    const { data: orig } = await admin
      .from("whatsapp_messages")
      .select("related_transaction_id")
      .eq("twilio_message_sid", inbound.in_reply_to_sid)
      .eq("user_id", userId)
      .maybeSingle();
    if (orig?.related_transaction_id) {
      targetTxId = orig.related_transaction_id;
    }
  }

  // 2b. Recent un-edited fallback
  if (!targetTxId) {
    const cutoff = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
    const { data: recent } = await admin
      .from("transactions")
      .select("id, last_notified_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("last_user_edit_at", null)
      .gte("last_notified_at", cutoff)
      .order("last_notified_at", { ascending: false })
      .limit(2);
    if (recent && recent.length === 1) {
      targetTxId = recent[0].id;
    }
  }

  // 2c. Could not resolve → ask and exit
  if (!targetTxId) {
    await sendAndLog({
      userId,
      body: "🤔 Which transaction? Quote one of my recent messages, or reply with the merchant name.",
      template: "wa_clarify",
    });
    await admin
      .from("whatsapp_messages")
      .update({
        intent: "unknown",
        parsed_payload: { reason: "no_target_transaction" } as Json,
      })
      .eq("id", inbound.id);
    return {
      ok: true,
      transaction_id: null,
      intent: "unknown",
      attachments_added: 0,
    };
  }

  // Load tx (for context + confirmation copy)
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select(
      "id, user_id, amount, merchant_name, name, user_category, is_pending",
    )
    .eq("id", targetTxId)
    .maybeSingle();

  if (txErr || !tx) {
    return { ok: true, skipped: true, reason: `target_tx_missing: ${txErr?.message ?? "deleted"}` };
  }

  const merchant = tx.merchant_name ?? tx.name ?? "Unknown";

  // ---------------------------------------------------------------------
  // 3. Download + persist any media
  // ---------------------------------------------------------------------
  const mediaItems = extractMediaItems(raw);
  let attachmentsAdded = 0;

  for (const item of mediaItems) {
    try {
      const file = await downloadTwilioMedia(item.url);
      if (!file) continue; // already logged inside

      // Validate content type — images and PDFs only.
      const mime = item.contentType || file.contentType || "application/octet-stream";
      if (!isAllowedAttachmentType(mime)) {
        await admin.from("app_events").insert({
          user_id: userId,
          event_type: "wa_attachment_rejected",
          payload: { reason: "disallowed_mime", mime, url: item.url },
        });
        continue;
      }
      if (file.bytes.byteLength > MAX_MEDIA_BYTES) {
        await admin.from("app_events").insert({
          user_id: userId,
          event_type: "wa_attachment_rejected",
          payload: {
            reason: "too_large",
            size: file.bytes.byteLength,
            url: item.url,
          },
        });
        continue;
      }

      const ext = extensionForMime(mime);
      const objectPath = `${userId}/${tx.id}/${randomUUID()}.${ext}`;

      const { error: uploadErr } = await admin.storage
        .from("receipts")
        .upload(objectPath, file.bytes, {
          contentType: mime,
          upsert: false,
        });
      if (uploadErr) {
        // Storage 409 = already exists (collision on the UUID — astronomically rare).
        // Either way, log and move on; don't break the whole reply over one image.
        await admin.from("app_events").insert({
          user_id: userId,
          event_type: "wa_attachment_storage_error",
          payload: { error: uploadErr.message, path: objectPath },
        });
        continue;
      }

      await admin.from("transaction_attachments").insert({
        user_id: userId,
        transaction_id: tx.id,
        storage_path: objectPath,
        mime_type: mime,
        size_bytes: file.bytes.byteLength,
        source: "whatsapp",
        twilio_media_url: item.url,
      });
      attachmentsAdded += 1;
    } catch (err) {
      // Media download failure is transient — but we don't want to block
      // intent application. Log and keep going.
      const message = err instanceof Error ? err.message : "media_failed";
      await admin.from("app_events").insert({
        user_id: userId,
        event_type: "wa_attachment_download_error",
        payload: { error: message, url: item.url },
      });
    }
  }

  // ---------------------------------------------------------------------
  // 4. Parse intent (only if there's body text)
  // ---------------------------------------------------------------------
  let intent: Intent;
  if (!body) {
    intent =
      attachmentsAdded > 0
        ? { intent: "note", note: "(receipt photo attached)" }
        : { intent: "unknown", reason: "empty_body_no_media" };
  } else {
    const userCategories = await loadUserCategories(admin);
    const result = await parseWhatsAppIntent({
      body,
      transaction: {
        amount: tx.amount,
        merchant,
        current_category: tx.user_category,
      },
      userCategories,
    });

    if (!result.ok) {
      // Logical LLM failure — degrade to unknown rather than retrying forever.
      intent = { intent: "unknown", reason: `claude_${result.reason}` };
    } else {
      intent = result.intent;
    }
  }

  // ---------------------------------------------------------------------
  // 5. Apply intent
  // ---------------------------------------------------------------------
  let confirmation: string;
  switch (intent.intent) {
    case "recategorize": {
      await admin
        .from("transactions")
        .update({
          user_category: intent.new_category,
          category_source: "manual",
          last_user_edit_at: new Date().toISOString(),
        })
        .eq("id", tx.id);
      await upsertCategoryRule({
        admin,
        userId,
        merchantName: tx.merchant_name ?? tx.name,
        categoryName: intent.new_category,
      });
      confirmation = `✅ Recategorized to ${intent.new_category}.`;
      break;
    }
    case "split": {
      // Note: effective_amount is a generated column; setting split_* is enough.
      await admin
        .from("transactions")
        .update({
          split_type: intent.split_type,
          split_value: intent.split_value,
          split_raw_input: intent.split_raw_input,
          last_user_edit_at: new Date().toISOString(),
        })
        .eq("id", tx.id);
      confirmation = formatSplitConfirmation(intent, tx.amount);
      break;
    }
    case "note": {
      await admin
        .from("transactions")
        .update({
          notes: intent.note,
          last_user_edit_at: new Date().toISOString(),
        })
        .eq("id", tx.id);
      confirmation = "✅ Note saved.";
      break;
    }
    case "exclude": {
      await admin
        .from("transactions")
        .update({
          excluded_from_stats: true,
          last_user_edit_at: new Date().toISOString(),
        })
        .eq("id", tx.id);
      confirmation = "🚫 Excluded from stats.";
      break;
    }
    case "include": {
      await admin
        .from("transactions")
        .update({
          excluded_from_stats: false,
          last_user_edit_at: new Date().toISOString(),
        })
        .eq("id", tx.id);
      confirmation = "↩️ Back in stats.";
      break;
    }
    case "unknown":
    default: {
      confirmation =
        attachmentsAdded > 0
          ? `✅ Photo attached to ${merchant} ${formatCurrency(Math.abs(tx.amount))}.`
          : `🤔 Didn't catch that. Try: "groceries", "split 1/3", "ignore", or send a photo.`;
      break;
    }
  }

  // Prepend an attachment ack if media came in alongside an intent.
  if (attachmentsAdded > 0 && intent.intent !== "unknown" && intent.intent !== "note") {
    confirmation = `✅ Photo attached. ${confirmation.replace(/^✅\s*/, "")}`;
  }

  // ---------------------------------------------------------------------
  // 6. Send confirmation
  // ---------------------------------------------------------------------
  await sendAndLog({
    userId,
    body: confirmation,
    template: "wa_confirmation",
    relatedTransactionId: tx.id,
  });

  // ---------------------------------------------------------------------
  // 7. Stamp inbound row
  // ---------------------------------------------------------------------
  await admin
    .from("whatsapp_messages")
    .update({
      intent: intent.intent,
      parsed_payload: intent as unknown as Json,
      related_transaction_id: tx.id,
    })
    .eq("id", inbound.id);

  return {
    ok: true,
    transaction_id: tx.id,
    intent: intent.intent,
    attachments_added: attachmentsAdded,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSplitConfirmation(
  intent: Extract<Intent, { intent: "split" }>,
  amount: number,
): string {
  const total = Math.abs(amount);
  let share: number;
  if (intent.split_type === "percent") {
    share = total * (intent.split_value / 100);
  } else if (intent.split_type === "ratio") {
    share = total * intent.split_value;
  } else {
    share = intent.split_value;
  }
  return `✅ Split — your share: ${formatCurrency(share)} (${intent.split_raw_input} of ${formatCurrency(total)}).`;
}

type MediaItem = { url: string; contentType: string | null };

function extractMediaItems(raw: Record<string, unknown>): MediaItem[] {
  const numMediaRaw = raw["NumMedia"];
  const numMedia =
    typeof numMediaRaw === "string"
      ? parseInt(numMediaRaw, 10)
      : typeof numMediaRaw === "number"
        ? numMediaRaw
        : 0;
  if (!numMedia || Number.isNaN(numMedia) || numMedia <= 0) return [];

  const items: MediaItem[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = raw[`MediaUrl${i}`];
    if (typeof url !== "string" || !url.startsWith("https://")) continue;
    const ct = raw[`MediaContentType${i}`];
    items.push({ url, contentType: typeof ct === "string" ? ct : null });
  }
  return items;
}

async function downloadTwilioMedia(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  // Twilio media URLs return a 302 to the actual asset on S3. Fetch follows
  // redirects by default; the credentials are only needed on the first hop.
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`twilio_media_${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    contentType: res.headers.get("content-type"),
  };
}

function isAllowedAttachmentType(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "application/pdf") return "pdf";
  // Fallback: take the part after the slash, strip params
  const after = mime.split("/")[1] ?? "bin";
  return after.split(";")[0]!.replace(/[^a-z0-9]/gi, "") || "bin";
}

async function loadUserCategories(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string[]> {
  const { data } = await admin
    .from("categories")
    .select("name, sort_order")
    .order("sort_order", { ascending: true });
  if (!data || data.length === 0) {
    // Last-ditch fallback so the LLM still has something to choose from.
    return ["Other"];
  }
  return data.map((c) => c.name);
}

/**
 * Send an outbound WhatsApp + log it to whatsapp_messages.
 * Used for both the "which transaction?" clarifier and the post-edit
 * confirmation. Twilio errors throw → QStash retries the whole job.
 */
async function sendAndLog(params: {
  userId: string;
  body: string;
  template: string;
  relatedTransactionId?: string;
}): Promise<void> {
  const admin = createAdminClient();

  const { data: pending, error: insertErr } = await admin
    .from("whatsapp_messages")
    .insert({
      user_id: params.userId,
      direction: "outbound",
      body: params.body,
      related_transaction_id: params.relatedTransactionId ?? null,
      status: "pending",
      template_name: params.template,
    })
    .select("id")
    .single();

  if (insertErr || !pending) {
    throw new Error(`whatsapp_messages insert failed: ${insertErr?.message ?? "missing"}`);
  }

  try {
    const result = await sendWhatsAppMessage({ body: params.body });
    await admin
      .from("whatsapp_messages")
      .update({
        twilio_message_sid: result.sid,
        provider_message_id: result.providerMessageId,
        status: result.status === "queued" ? "sent" : result.status,
        raw: result.raw as unknown as Json,
      })
      .eq("id", pending.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "twilio_failed";
    await admin
      .from("whatsapp_messages")
      .update({ status: "failed", error: message })
      .eq("id", pending.id);
    throw err;
  }
}
