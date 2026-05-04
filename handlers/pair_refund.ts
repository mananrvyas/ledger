import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeMerchant } from "@/lib/plaid-category-map";

/**
 * Same merchant + exact amount + within 30 days = refund pair.
 *
 * Only runs on negative-amount transactions (credits / refunds on cards).
 * The pair is the original positive purchase.
 *
 * Skips on multiple matches; logs an `app_events` row for review.
 */
export async function pairRefundHandler(payload: {
  transaction_id: string;
}): Promise<{ paired: boolean; reason?: string }> {
  const admin = createAdminClient();

  const { data: tx } = await admin
    .from("transactions")
    .select("id, user_id, account_id, amount, date, merchant_name, name, is_refund, refund_pair_id, deleted_at")
    .eq("id", payload.transaction_id)
    .maybeSingle();

  if (!tx) return { paired: false, reason: "missing" };
  if (tx.deleted_at) return { paired: false, reason: "deleted" };
  if (tx.amount >= 0) return { paired: false, reason: "not_credit" };
  if (tx.is_refund || tx.refund_pair_id) return { paired: false, reason: "already_paired" };

  const pattern = normalizeMerchant(tx.merchant_name ?? tx.name);
  if (!pattern) return { paired: false, reason: "no_merchant" };

  const lo = new Date(tx.date);
  lo.setDate(lo.getDate() - 30);
  const loDate = lo.toISOString().slice(0, 10);

  // Find candidate purchases on the same account, within 30 days prior, with
  // exact magnitude match, not already refunded.
  const { data: candidates } = await admin
    .from("transactions")
    .select("id, merchant_name, name, amount, date, refund_pair_id")
    .eq("user_id", tx.user_id)
    .eq("account_id", tx.account_id)
    .is("deleted_at", null)
    .gt("amount", 0)
    .gte("date", loDate)
    .lte("date", tx.date);

  const target = Math.abs(tx.amount);
  const matches = (candidates ?? []).filter((c) => {
    if (c.refund_pair_id) return false;
    if (Math.abs(c.amount - target) > 0.01) return false;
    const cPattern = normalizeMerchant(c.merchant_name ?? c.name);
    return cPattern === pattern;
  });

  if (matches.length === 0) return { paired: false, reason: "no_match" };

  if (matches.length > 1) {
    await admin.from("app_events").insert({
      user_id: tx.user_id,
      event_type: "ambiguous_refund_pair",
      payload: {
        transaction_id: tx.id,
        candidate_count: matches.length,
        candidate_ids: matches.map((m) => m.id),
      },
    });
    return { paired: false, reason: "ambiguous" };
  }

  const original = matches[0];

  // Mark the credit as a refund linked to the original.
  await admin
    .from("transactions")
    .update({
      is_refund: true,
      refund_pair_id: original.id,
      user_category: "Refund",
      category_source: "rule",
    })
    .eq("id", tx.id);

  // Backlink the original purchase (so the UI can show "refunded" indicator).
  await admin
    .from("transactions")
    .update({ refund_pair_id: tx.id })
    .eq("id", original.id);

  return { paired: true };
}
