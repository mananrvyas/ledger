import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/twilio";
import {
  parseWhatsAppIntent,
  hasActionableField,
  type Action,
} from "@/lib/intent";
import { upsertCategoryRule } from "@/lib/categorize";
import { formatCurrency } from "@/lib/format";
import type { Json, TablesUpdate } from "@/lib/database.types";

/**
 * Inbound WhatsApp reply worker. Pipeline:
 *   1. Load inbound whatsapp_messages row (idempotent — skip if intent set).
 *   2. Resolve target transaction:
 *        a. quoted reply → look up outbound row by Twilio's OriginalRepliedMessageSid
 *        b. fallback     → MOST RECENT outbound tx_notification's related_transaction_id,
 *                          inside a 60-min window. No "exactly one" gate, no
 *                          last_user_edit_at filter — the user told us they
 *                          want stickiness on the latest ping.
 *        c. otherwise    → ask "which transaction?" and exit
 *   3. Download any media (Twilio basic auth) → upload to Storage → insert
 *      transaction_attachments rows.
 *   4. Parse text body (if non-empty) into a multi-field Action.
 *   5. Apply EACH set field on the Action (recategorize, split, note,
 *      exclude_set) — they compose. Stitch a single confirmation message.
 *   6. Send the confirmation via Twilio.
 *   7. Stamp the inbound row with intent + parsed_payload + related_transaction_id.
 *
 * Failure model: throws on transient (network/Twilio/Anthropic) so QStash
 * retries; returns `{ skipped: true }` on idempotent re-runs and benign no-ops.
 */

const RECENT_WINDOW_MIN = 60;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB

export type ParseWaReplyResult =
  | { ok: true; skipped: true; reason: string }
  | {
      ok: true;
      skipped?: false;
      transaction_id: string | null;
      intent_label: string;
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
  let matchSource: "quoted" | "recent" | null = null;

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
      matchSource = "quoted";
    }
  }

  // 2b. No quote → most recent notification's tx, within 60 min.
  // We look at the outbound `tx_notification` log directly (rather than
  // transactions.last_notified_at) so we always glue the reply to the
  // SAME transaction the user just saw on their phone, even if that tx
  // was edited via web in between, or another tx was edited after.
  if (!targetTxId) {
    const cutoff = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
    const { data: latest } = await admin
      .from("whatsapp_messages")
      .select("related_transaction_id, created_at")
      .eq("user_id", userId)
      .eq("direction", "outbound")
      .eq("template_name", "tx_notification")
      .not("related_transaction_id", "is", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.related_transaction_id) {
      targetTxId = latest.related_transaction_id;
      matchSource = "recent";
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
      intent_label: "unknown",
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
      if (!file) continue;

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
  let action: Action | null = null;
  let llmReason: string | null = null;

  if (body) {
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
      llmReason = `claude_${result.reason}`;
    } else {
      action = result.action;
    }
  }

  // ---------------------------------------------------------------------
  // 5. Apply each present field on the Action
  // ---------------------------------------------------------------------
  const editedAt = new Date().toISOString();
  const txUpdate: TablesUpdate<"transactions"> = {};
  const confirmationParts: string[] = [];
  const appliedLabels: string[] = [];

  if (attachmentsAdded > 0) {
    confirmationParts.push(
      `📎 Photo attached to ${merchant} ${formatCurrency(Math.abs(tx.amount))}.`,
    );
    appliedLabels.push("photo");
  }

  if (action) {
    if (action.recategorize) {
      txUpdate.user_category = action.recategorize.new_category;
      txUpdate.category_source = "manual";
      txUpdate.last_user_edit_at = editedAt;
      // Learn the rule asynchronously — handler awaits it after the main update.
      confirmationParts.push(
        `✅ Recategorized to ${action.recategorize.new_category}.`,
      );
      appliedLabels.push("recategorize");
    }

    if (action.split) {
      // effective_amount is a generated column; setting split_* is enough.
      txUpdate.split_type = action.split.split_type;
      txUpdate.split_value = action.split.split_value;
      txUpdate.split_raw_input = action.split.split_raw_input;
      txUpdate.last_user_edit_at = editedAt;
      const total = Math.abs(tx.amount);
      const share =
        action.split.split_type === "percent"
          ? total * (action.split.split_value / 100)
          : action.split.split_type === "ratio"
            ? total * action.split.split_value
            : action.split.split_value;
      confirmationParts.push(
        `✂️ Split — your share: ${formatCurrency(share)} (${action.split.split_raw_input} of ${formatCurrency(total)}).`,
      );
      appliedLabels.push("split");
    }

    if (action.note != null && action.note.trim().length > 0) {
      txUpdate.notes = action.note;
      txUpdate.last_user_edit_at = editedAt;
      confirmationParts.push("📝 Note saved.");
      appliedLabels.push("note");
    }

    if (action.exclude_set != null) {
      txUpdate.excluded_from_stats = action.exclude_set;
      txUpdate.last_user_edit_at = editedAt;
      confirmationParts.push(
        action.exclude_set ? "🚫 Excluded from stats." : "↩️ Back in stats.",
      );
      appliedLabels.push(action.exclude_set ? "exclude" : "include");
    }
  }

  // Persist tx changes (one update for all fields).
  if (Object.keys(txUpdate).length > 0) {
    await admin.from("transactions").update(txUpdate).eq("id", tx.id);
    if (action?.recategorize) {
      await upsertCategoryRule({
        admin,
        userId,
        merchantName: tx.merchant_name ?? tx.name,
        categoryName: action.recategorize.new_category,
      });
    }
  }

  // If nothing was applied, ask for clarification (unless we just attached a photo).
  if (confirmationParts.length === 0) {
    if (llmReason) {
      confirmationParts.push(
        `🤔 Didn't catch that. Try: "groceries", "split 1/3", "ignore", or send a photo.`,
      );
      appliedLabels.push("unclear_llm");
    } else if (action?.unclear) {
      confirmationParts.push(
        `🤔 Didn't catch that. Try: "groceries", "split 1/3", "ignore", or send a photo.`,
      );
      appliedLabels.push("unclear");
    } else if (!body) {
      // Silent edge case: no body, no media — nothing to do.
      confirmationParts.push("(empty message — nothing to do)");
      appliedLabels.push("empty");
    } else {
      confirmationParts.push(
        `🤔 Didn't catch that. Try: "groceries", "split 1/3", "ignore", or send a photo.`,
      );
      appliedLabels.push("unclear");
    }
  }

  const confirmation = confirmationParts.join("\n");
  const intentLabel = appliedLabels.length > 0 ? appliedLabels.join("+") : "unknown";

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
  const parsedPayload: Record<string, unknown> = {
    intent: intentLabel,
    match_source: matchSource,
    attachments_added: attachmentsAdded,
  };
  if (action) parsedPayload.action = action;
  if (llmReason) parsedPayload.llm_reason = llmReason;

  await admin
    .from("whatsapp_messages")
    .update({
      intent: intentLabel,
      parsed_payload: parsedPayload as Json,
      related_transaction_id: tx.id,
    })
    .eq("id", inbound.id);

  return {
    ok: true,
    transaction_id: tx.id,
    intent_label: intentLabel,
    attachments_added: attachmentsAdded,
  };
}

// Keep `hasActionableField` referenced so the import tree is honest.
void hasActionableField;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  if (!data || data.length === 0) return ["Other"];
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
