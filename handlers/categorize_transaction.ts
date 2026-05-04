import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { categorizeTransaction, pairTransferIfMatch } from "@/lib/categorize";
import { publishJob } from "@/lib/qstash";
import type { PlaidConfidence } from "@/lib/plaid-category-map";

/**
 * Categorize one transaction:
 *   1. Run the waterfall (Plaid → rules → Claude)
 *   2. Persist the result on the transactions row
 *   3. Synchronously try to pair as a transfer (cheap, avoids races later)
 *   4. Enqueue a refund-pairing pass for negative amounts (cheap, async)
 *
 * Idempotent — if `category_source` is already set, returns early. Backfill
 * and force-recategorize callers can pass `force: true` to overwrite.
 */
export async function categorizeTransactionHandler(payload: {
  transaction_id: string;
  force?: boolean;
}): Promise<{
  ok: true;
  category: string;
  source: string;
  paired_transfer: boolean;
} | { ok: false; reason: string }> {
  const admin = createAdminClient();

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select(
      "id, user_id, account_id, amount, date, merchant_name, name, plaid_category, plaid_category_detail, plaid_confidence, category_source, deleted_at, is_transfer",
    )
    .eq("id", payload.transaction_id)
    .maybeSingle();

  if (txErr || !tx) {
    return { ok: false, reason: `tx_not_found: ${txErr?.message ?? "missing"}` };
  }
  if (tx.deleted_at) return { ok: false, reason: "deleted" };
  if (tx.is_transfer) return { ok: false, reason: "already_transfer" };
  if (!payload.force && tx.category_source) {
    return { ok: false, reason: "already_categorized" };
  }

  // Load the user's category list (defaults + their overrides).
  const { data: catRows } = await admin
    .from("categories")
    .select("name")
    .or(`user_id.eq.${tx.user_id},and(user_id.is.null,is_default.eq.true)`);
  const userCategories = (catRows ?? []).map((c) => c.name);

  if (userCategories.length === 0) {
    return { ok: false, reason: "no_categories" };
  }

  const result = await categorizeTransaction({
    userId: tx.user_id,
    admin,
    tx: {
      merchant_name: tx.merchant_name,
      name: tx.name,
      amount: tx.amount,
      date: tx.date,
      plaid_category: tx.plaid_category,
      plaid_category_detail: tx.plaid_category_detail,
      plaid_confidence: tx.plaid_confidence as PlaidConfidence,
    },
    userCategories,
  });

  // Persist on the transaction row.
  await admin
    .from("transactions")
    .update({
      user_category: result.category,
      category_source: result.source,
      ai_category: result.source === "ai" ? result.ai_category_used ?? result.category : null,
      ai_confidence: result.source === "ai" ? result.confidence : null,
      ai_reasoning: result.source === "ai" ? result.reasoning ?? null : null,
    })
    .eq("id", tx.id);

  // Try to pair as a transfer synchronously. If it pairs, the row's category
  // is overridden to "Transfer" inside pairTransferIfMatch.
  const pairResult = await pairTransferIfMatch({
    admin,
    userId: tx.user_id,
    transactionId: tx.id,
  });

  // Enqueue refund pairing for negative-amount (credit) transactions.
  // Cheap async — if it doesn't pair, it stays as the categorized result.
  if (!pairResult.paired && tx.amount < 0) {
    try {
      await publishJob({
        type: "pair_refund",
        idempotency_key: `pair-refund-${tx.id}`,
        payload: { transaction_id: tx.id },
      });
    } catch {
      // QStash unavailable — best-effort, the fallback cron will catch it.
    }
  }

  return {
    ok: true,
    category: pairResult.paired ? "Transfer" : result.category,
    source: pairResult.paired ? "rule" : result.source,
    paired_transfer: pairResult.paired,
  };
}
