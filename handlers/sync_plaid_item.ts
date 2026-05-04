import "server-only";
import type {
  Transaction as PlaidTransaction,
  RemovedTransaction,
} from "plaid";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { getDecryptedAccessToken } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid";
import { publishJob } from "@/lib/qstash";

export type SyncResult = {
  added: number;
  modified: number;
  removed: number;
  skipped?: boolean;
  reason?: string;
};

/**
 * Sync transactions for a Plaid item using the cursor-based /transactions/sync
 * endpoint. Idempotent and safe to retry — the cursor is the source of truth.
 *
 * For Phase 1: persists structural columns and full Plaid payload in `raw`.
 * Categorization, transfer pairing, refund pairing, and WhatsApp notifications
 * are layered on in subsequent phases.
 */
export async function syncPlaidItem(payload: {
  plaid_item_id: string;
}): Promise<SyncResult> {
  const admin = createAdminClient();

  // 1. Load the item.
  const { data: item, error: itemErr } = await admin
    .from("plaid_items")
    .select("id, user_id, cursor, status")
    .eq("id", payload.plaid_item_id)
    .maybeSingle();

  if (itemErr || !item) {
    throw new Error(
      `sync_plaid_item: item not found ${payload.plaid_item_id}: ${itemErr?.message ?? "missing"}`,
    );
  }
  if (item.status === "disconnected") {
    return { added: 0, modified: 0, removed: 0, skipped: true, reason: "disconnected" };
  }

  // 2. Decrypt access token (server-only).
  const accessToken = await getDecryptedAccessToken(item.id);

  // 3. Build account map (plaid_account_id -> uuid).
  const { data: accountRows } = await admin
    .from("accounts")
    .select("id, plaid_account_id")
    .eq("plaid_item_id", item.id);
  const accountMap = new Map(
    (accountRows ?? []).map((a) => [a.plaid_account_id, a.id]),
  );

  // 4. Sync loop using transactionsSync.
  const plaid = getPlaidClient();
  let cursor: string | undefined = item.cursor ?? undefined;
  let added: PlaidTransaction[] = [];
  let modified: PlaidTransaction[] = [];
  let removed: RemovedTransaction[] = [];
  let hasMore = true;
  let iterations = 0;
  const MAX_ITERATIONS = 50; // safety: ~50 * 500 = 25K txns

  while (hasMore && iterations < MAX_ITERATIONS) {
    iterations++;
    const resp = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
    });
    added = added.concat(resp.data.added);
    modified = modified.concat(resp.data.modified);
    removed = removed.concat(resp.data.removed);
    hasMore = resp.data.has_more;
    cursor = resp.data.next_cursor;
  }

  // 5. Audit log: full sync stats (no transaction data, just counts and IDs).
  await admin.from("app_events").insert({
    user_id: item.user_id,
    event_type: "plaid_sync_response",
    payload: {
      plaid_item_id: item.id,
      added_count: added.length,
      modified_count: modified.length,
      removed_count: removed.length,
      iterations,
      cursor_advanced: cursor !== item.cursor,
    },
  });

  // 6. Insert added transactions (upsert on plaid_transaction_id for idempotency).
  let insertedRowIds: string[] = [];
  if (added.length > 0) {
    const insertRows = added
      .map((t) => {
        const accountId = accountMap.get(t.account_id);
        if (!accountId) return null;
        const pfc = (t as unknown as {
          personal_finance_category?: {
            primary?: string;
            detailed?: string;
            confidence_level?: string;
          };
        }).personal_finance_category;
        return {
          account_id: accountId,
          user_id: item.user_id,
          plaid_transaction_id: t.transaction_id,
          amount: t.amount,
          currency: t.iso_currency_code ?? "USD",
          date: t.date,
          authorized_date: t.authorized_date ?? null,
          merchant_name: t.merchant_name ?? null,
          name: t.name,
          merchant_logo_url: t.logo_url ?? null,
          is_pending: t.pending,
          plaid_category: pfc?.primary ?? null,
          plaid_category_detail: pfc?.detailed ?? null,
          plaid_confidence: pfc?.confidence_level ?? null,
          raw: t as unknown as Json,
        };
      })
      .filter(<T,>(x: T | null): x is T => x !== null);

    if (insertRows.length > 0) {
      const { data: insertedRows, error: insErr } = await admin
        .from("transactions")
        .upsert(insertRows, { onConflict: "plaid_transaction_id" })
        .select("id");
      if (insErr) {
        throw new Error(
          `sync_plaid_item: insert added failed: ${insErr.message}`,
        );
      }
      insertedRowIds = (insertedRows ?? []).map((r) => r.id);
    }
  }

  // 7. Update modified transactions. Capture previous state to decide whether
  //    to re-notify on pending → posted transitions per the rule in
  //    docs/04-categorization.md (>5% amount change OR category change).
  const reNotifyTxIds: string[] = [];
  for (const t of modified) {
    const { data: prev } = await admin
      .from("transactions")
      .select("id, is_pending, amount, notified_amount, last_notified_at, is_transfer")
      .eq("plaid_transaction_id", t.transaction_id)
      .maybeSingle();

    const { error: modErr } = await admin
      .from("transactions")
      .update({
        amount: t.amount,
        date: t.date,
        authorized_date: t.authorized_date ?? null,
        merchant_name: t.merchant_name ?? null,
        name: t.name,
        is_pending: t.pending,
        raw: t as unknown as Json,
      })
      .eq("plaid_transaction_id", t.transaction_id);
    if (modErr) {
      throw new Error(
        `sync_plaid_item: update modified failed: ${modErr.message}`,
      );
    }

    if (!prev || prev.is_transfer) continue;

    const wasPending = prev.is_pending === true;
    const isPostedNow = t.pending === false;
    const baseline = prev.notified_amount ?? prev.amount;
    const amountChangedMaterially =
      baseline !== 0 && Math.abs(t.amount - baseline) / Math.abs(baseline) > 0.05;

    if (wasPending && isPostedNow && prev.last_notified_at && amountChangedMaterially) {
      reNotifyTxIds.push(prev.id);
    }
  }

  // 8. Soft-delete removed transactions.
  for (const r of removed) {
    if (!r.transaction_id) continue;
    await admin
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("plaid_transaction_id", r.transaction_id);
  }

  // 9. Persist new cursor + last_synced_at.
  await admin
    .from("plaid_items")
    .update({
      cursor: cursor ?? null,
      last_synced_at: new Date().toISOString(),
      status: "active",
      error_code: null,
      error_message: null,
    })
    .eq("id", item.id);

  // 10. Enqueue categorize_transaction for each newly inserted row. Best
  //     effort — if QStash is down we silently skip; the backfill route or
  //     fallback cron can catch up later. Don't throw inside the loop.
  for (const id of insertedRowIds) {
    try {
      await publishJob({
        type: "categorize_transaction",
        idempotency_key: `categorize-${id}`,
        payload: { transaction_id: id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "publish failed";
      await admin.from("app_events").insert({
        user_id: item.user_id,
        event_type: "qstash_publish_failed",
        payload: { source: "sync_plaid_item", transaction_id: id, error: message },
      });
    }
  }

  // 11. Enqueue re-notify for any transactions that just transitioned from
  //     pending → posted with a material amount change. Idempotency key
  //     includes a timestamp bucket so subsequent material updates can fire
  //     again, but the same sync replay won't.
  for (const id of reNotifyTxIds) {
    try {
      await publishJob({
        type: "send_wa_notification",
        idempotency_key: `wa-renotify-${id}-${Math.floor(Date.now() / 60000)}`,
        payload: { transaction_id: id, variant: "re-notify" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "publish failed";
      await admin.from("app_events").insert({
        user_id: item.user_id,
        event_type: "qstash_publish_failed",
        payload: { source: "sync_plaid_item_renotify", transaction_id: id, error: message },
      });
    }
  }

  return {
    added: added.length,
    modified: modified.length,
    removed: removed.length,
  };
}
