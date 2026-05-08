import "server-only";
import type {
  Transaction as PlaidTransaction,
  RemovedTransaction,
  AccountBase,
} from "plaid";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { getDecryptedAccessToken } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid";
import { publishJob } from "@/lib/qstash";
import { normalizeMerchant } from "@/lib/plaid-category-map";

export type SyncResult = {
  added: number;
  modified: number;
  removed: number;
  balances_updated?: number;
  carried_over?: number;
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
  let latestAccounts: AccountBase[] = [];
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
    // Plaid returns the live (cached) accounts array on every page; the last
    // page wins. We use this to refresh accounts.current_balance + write a
    // daily balance_snapshots row — for free, since transactionsSync calls are
    // bundled in the Transactions subscription. Replaces a metered
    // `accountsBalanceGet` call.
    latestAccounts = resp.data.accounts ?? latestAccounts;
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

  // 8. Soft-delete removed transactions, carrying over user state to a
  //    replacement row when one exists. Pending → posted on Chase (and
  //    others) often re-issues a different plaid_transaction_id: Plaid
  //    `removes` the pending row and `adds` a fresh posted row in the same
  //    sync. Without carry-over, the user's manual edits (split, exclude,
  //    notes, last_notified_at) get stranded on the soft-deleted predecessor
  //    and the new row pings them again.
  let carriedOverCount = 0;
  for (const r of removed) {
    if (!r.transaction_id) continue;

    // Load the predecessor's full state before we soft-delete it.
    const { data: oldRow } = await admin
      .from("transactions")
      .select(
        "id, account_id, user_id, merchant_name, name, amount, date, excluded_from_stats, split_type, split_value, split_raw_input, split_note, notes, last_user_edit_at, last_notified_at, notified_amount",
      )
      .eq("plaid_transaction_id", r.transaction_id)
      .maybeSingle();

      const hasUserState =
      oldRow != null &&
      (oldRow.excluded_from_stats === true ||
        oldRow.split_type !== "none" ||
        (oldRow.notes != null && oldRow.notes.length > 0) ||
        oldRow.last_notified_at != null);

      if (oldRow && hasUserState) {
      // Find a recently-inserted active row on the same account with the
      // same merchant + amount within ±5% within ±7 days. We just upserted
      // `added` rows in step 6, so the replacement is already in the DB and
      // not yet soft-deleted (we're still iterating `removed`).
      const merchantPattern = normalizeMerchant(
        oldRow.merchant_name ?? oldRow.name,
      );
      const lo = new Date(oldRow.date);
      lo.setDate(lo.getDate() - 7);
      const hi = new Date(oldRow.date);
      hi.setDate(hi.getDate() + 7);

      const { data: candidates } = await admin
        .from("transactions")
        .select(
          "id, plaid_transaction_id, merchant_name, name, amount",
        )
        .eq("account_id", oldRow.account_id)
        .eq("user_id", oldRow.user_id)
        .neq("plaid_transaction_id", r.transaction_id)
        .is("deleted_at", null)
        .gte("date", lo.toISOString().slice(0, 10))
        .lte("date", hi.toISOString().slice(0, 10))
        .order("created_at", { ascending: false })
        .limit(8);

      const replacement = (candidates ?? []).find((c) => {
        const cPattern = normalizeMerchant(c.merchant_name ?? c.name);
        if (!merchantPattern || cPattern !== merchantPattern) return false;
        const oldAbs = Math.abs(oldRow.amount);
        const newAbs = Math.abs(c.amount);
        const tolerance = Math.max(oldAbs * 0.05, 0.5);
        return Math.abs(oldAbs - newAbs) <= tolerance;
      });

      if (replacement) {
        await admin
          .from("transactions")
          .update({
            excluded_from_stats: oldRow.excluded_from_stats,
            split_type: oldRow.split_type,
            split_value: oldRow.split_value,
            split_raw_input: oldRow.split_raw_input,
            split_note: oldRow.split_note,
            notes: oldRow.notes,
            last_user_edit_at: oldRow.last_user_edit_at,
            // Inheriting last_notified_at also makes send_wa_notification
            // skip the duplicate ping for the new row (its existing
            // already_notified gate kicks in).
            last_notified_at: oldRow.last_notified_at,
            notified_amount: oldRow.notified_amount,
          })
          .eq("id", replacement.id);

        await admin.from("app_events").insert({
          user_id: oldRow.user_id,
          event_type: "tx_state_carried_over",
          payload: {
            from_id: oldRow.id,
            to_id: replacement.id,
            from_plaid_id: r.transaction_id,
            to_plaid_id: replacement.plaid_transaction_id,
            merchant: oldRow.merchant_name ?? oldRow.name,
          },
        });
        carriedOverCount++;
      }
    }

    // Now soft-delete the predecessor. (Order: copy-then-delete so the active
    // SELECT above can find the row even if iteration order is unusual.)
    await admin
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("plaid_transaction_id", r.transaction_id);
  }

  // 9. Refresh accounts.current_balance + upsert today's balance_snapshots
  //    using the balances Plaid returned in the sync response. No extra Plaid
  //    API call needed — these came in the response we already paid for.
  const today = new Date().toISOString().slice(0, 10);
  let balancesUpdated = 0;
  for (const a of latestAccounts) {
    const accountUuid = accountMap.get(a.account_id);
    if (!accountUuid) continue;

    const current = a.balances.current ?? null;
    const available = a.balances.available ?? null;

    await admin
      .from("accounts")
      .update({
        current_balance: current,
        available_balance: available,
      })
      .eq("id", accountUuid);

    await admin.from("balance_snapshots").upsert(
      {
        account_id: accountUuid,
        user_id: item.user_id,
        date: today,
        current_balance: current,
        available_balance: available,
      },
      { onConflict: "account_id,date" },
    );
    balancesUpdated += 1;
  }

  // 10. Persist new cursor + last_synced_at.
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

  // 11. Enqueue categorize_transaction for each newly inserted row. Best
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

  // 12. Enqueue re-notify for any transactions that just transitioned from
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
    balances_updated: balancesUpdated,
    carried_over: carriedOverCount,
  };
}
