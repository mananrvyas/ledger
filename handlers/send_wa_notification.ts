import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/twilio";
import { formatCurrency, formatShortDate } from "@/lib/format";
import type { Json } from "@/lib/database.types";

/**
 * Send a WhatsApp notification for a single transaction.
 *
 * Variants:
 *   - 'new'       — first-time notification when a transaction is categorized
 *   - 're-notify' — pending → posted with material change (>5% amount or
 *                   category change). Different copy so the user knows it's
 *                   an update, not a new charge.
 *
 * Sandbox-only for now: free-form body, no approved template required.
 *
 * Idempotency: keyed on (transaction_id, variant) — same key won't double-send
 * because QStash dedupes on idempotency keys we publish with.
 */

const FALLBACK_PRIOR_AMOUNT = (n: number) => formatCurrency(Math.abs(n));

export async function sendWaNotificationHandler(payload: {
  transaction_id: string;
  variant: "new" | "re-notify";
}): Promise<{
  ok: true;
  twilio_sid: string;
  status: string;
  variant: string;
  skipped?: false;
} | {
  ok: true;
  skipped: true;
  reason: string;
}> {
  const admin = createAdminClient();

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select(
      "id, user_id, amount, effective_amount, date, merchant_name, name, user_category, is_pending, is_transfer, is_refund, deleted_at, last_notified_at, notified_amount",
    )
    .eq("id", payload.transaction_id)
    .maybeSingle();

  if (txErr || !tx) {
    return { ok: true, skipped: true, reason: `tx_not_found: ${txErr?.message ?? "missing"}` };
  }
  if (tx.deleted_at) return { ok: true, skipped: true, reason: "deleted" };
  if (tx.is_transfer) return { ok: true, skipped: true, reason: "is_transfer" };

  // For 'new' variant, skip if we already notified for this row.
  if (payload.variant === "new" && tx.last_notified_at) {
    return { ok: true, skipped: true, reason: "already_notified" };
  }

  const merchant = tx.merchant_name ?? tx.name ?? "Unknown merchant";
  const category = tx.user_category ?? "Uncategorized";
  const isCredit = tx.amount < 0;
  const displayAmount = isCredit ? Math.abs(tx.amount) : tx.amount;

  let body: string;
  if (payload.variant === "re-notify") {
    const priorAmount =
      tx.notified_amount != null
        ? FALLBACK_PRIOR_AMOUNT(tx.notified_amount)
        : null;
    const newAmount = formatCurrency(displayAmount);
    body = [
      `🔄 *Updated*${isCredit ? " (refund)" : ""}: ${
        priorAmount ? `${priorAmount} → ` : ""
      }*${newAmount}* at ${merchant}`,
      `→ ${category}`,
      tx.is_pending ? "(still pending)" : "(now posted)",
    ].join("\n");
  } else {
    const refundLabel = isCredit ? " (refund)" : "";
    body = [
      `${isCredit ? "↩️" : "💳"} *${formatCurrency(displayAmount)}*${refundLabel} at ${merchant}`,
      `→ ${category}`,
      `${formatShortDate(tx.date)}${tx.is_pending ? " · pending" : ""}`,
      "Reply to change (e.g. \"split 1/3\", \"this is groceries\", \"ignore\", or attach photo)",
    ].join("\n");
  }

  // Insert a 'pending' row first; we'll update with the Twilio SID after the
  // call returns so we have an audit trail even if Twilio errors.
  const { data: pendingRow, error: insertErr } = await admin
    .from("whatsapp_messages")
    .insert({
      user_id: tx.user_id,
      direction: "outbound",
      body,
      related_transaction_id: tx.id,
      status: "pending",
      template_name: payload.variant === "re-notify" ? "tx_renotify" : "tx_notification",
    })
    .select("id")
    .single();

  if (insertErr || !pendingRow) {
    throw new Error(`whatsapp_messages insert failed: ${insertErr?.message ?? "missing"}`);
  }

  try {
    const result = await sendWhatsAppMessage({ body });

    await admin
      .from("whatsapp_messages")
      .update({
        twilio_message_sid: result.sid,
        provider_message_id: result.providerMessageId,
        status: result.status === "queued" ? "sent" : result.status,
        raw: result.raw as unknown as Json,
      })
      .eq("id", pendingRow.id);

    // Stamp the transaction so we know we notified, and what amount we showed
    // (for the >5% re-notify rule).
    await admin
      .from("transactions")
      .update({
        last_notified_at: new Date().toISOString(),
        notified_amount: tx.amount,
      })
      .eq("id", tx.id);

    return {
      ok: true,
      twilio_sid: result.sid,
      status: result.status,
      variant: payload.variant,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "twilio_failed";
    // Mark the row as failed for audit purposes, then re-throw so QStash
    // retries with backoff.
    await admin
      .from("whatsapp_messages")
      .update({ status: "failed", error: message })
      .eq("id", pendingRow.id);
    throw err;
  }
}
