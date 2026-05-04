import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDecryptedAccessToken } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid";

/**
 * Pull current account balances from Plaid for one item and snapshot them.
 *
 * Per-item rather than per-user so:
 *   - one slow Plaid call doesn't block all items in a single QStash worker;
 *   - retries are scoped to the item that actually failed.
 *
 * Side effects:
 *   - accounts.{current_balance, available_balance} updated to the live values.
 *   - balance_snapshots row upserted on (account_id, today) — idempotent on a
 *     same-day re-run (the cron only fires once daily, but manual triggers
 *     don't double-write).
 */
export async function snapshotBalancesHandler(payload: {
  plaid_item_id: string;
}): Promise<{
  ok: true;
  item_id: string;
  accounts_updated: number;
  snapshots_written: number;
  skipped?: boolean;
  reason?: string;
}> {
  const admin = createAdminClient();

  // 1. Load the item
  const { data: item, error: itemErr } = await admin
    .from("plaid_items")
    .select("id, user_id, status")
    .eq("id", payload.plaid_item_id)
    .maybeSingle();
  if (itemErr || !item) {
    throw new Error(
      `snapshot_balances: item not found ${payload.plaid_item_id}: ${itemErr?.message ?? "missing"}`,
    );
  }
  if (item.status === "disconnected") {
    return {
      ok: true,
      item_id: item.id,
      accounts_updated: 0,
      snapshots_written: 0,
      skipped: true,
      reason: "disconnected",
    };
  }

  // 2. Decrypt token + call Plaid
  const accessToken = await getDecryptedAccessToken(item.id);
  const plaid = getPlaidClient();
  const response = await plaid.accountsBalanceGet({ access_token: accessToken });
  const plaidAccounts = response.data.accounts;

  // 3. Build account_id (uuid) lookup keyed by Plaid's account_id
  const { data: accountRows } = await admin
    .from("accounts")
    .select("id, plaid_account_id")
    .eq("plaid_item_id", item.id);
  const accountMap = new Map(
    (accountRows ?? []).map((a) => [a.plaid_account_id, a.id]),
  );

  const today = new Date().toISOString().slice(0, 10);
  let accountsUpdated = 0;
  let snapshotsWritten = 0;

  for (const a of plaidAccounts) {
    const accountUuid = accountMap.get(a.account_id);
    if (!accountUuid) continue; // unknown account (out-of-band create); skip

    const current = a.balances.current ?? null;
    const available = a.balances.available ?? null;

    const { error: updErr } = await admin
      .from("accounts")
      .update({
        current_balance: current,
        available_balance: available,
      })
      .eq("id", accountUuid);
    if (!updErr) accountsUpdated += 1;

    const { error: snapErr } = await admin
      .from("balance_snapshots")
      .upsert(
        {
          account_id: accountUuid,
          user_id: item.user_id,
          date: today,
          current_balance: current,
          available_balance: available,
        },
        { onConflict: "account_id,date" },
      );
    if (!snapErr) snapshotsWritten += 1;
  }

  return {
    ok: true,
    item_id: item.id,
    accounts_updated: accountsUpdated,
    snapshots_written: snapshotsWritten,
  };
}
