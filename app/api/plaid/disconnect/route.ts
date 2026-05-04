import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDecryptedAccessToken } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid";

export const dynamic = "force-dynamic";

/**
 * Disconnect a linked Plaid item.
 *
 * Tries to release the item on Plaid's side via `itemRemove` (best-effort —
 * fails silently for sandbox tokens against production env, expired tokens,
 * etc.). Then soft-deletes locally:
 *   - plaid_items.status = 'disconnected'
 *   - accounts.is_archived = true (for accounts on this item)
 *   - if `wipe_transactions` body flag is set, transactions.deleted_at = now()
 *     for all txs on those accounts
 *
 * Body: { plaid_item_id: string, wipe_transactions?: boolean }
 *
 * Auth-gated. Ownership verified via RLS-bound select before any write.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plaid_item_id?: string; wipe_transactions?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // empty body
  }
  if (!body.plaid_item_id) {
    return Response.json({ error: "plaid_item_id required" }, { status: 400 });
  }

  // Ownership check via RLS (anon-keyed Supabase client respects auth).
  const { data: item, error: itemErr } = await supabase
    .from("plaid_items")
    .select("id, institution_name, status")
    .eq("id", body.plaid_item_id)
    .maybeSingle();
  if (itemErr || !item) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Best-effort Plaid itemRemove. Sandbox tokens against production env will
  // 400; expired tokens will too. Either way we keep going with the local
  // soft-delete so the user isn't blocked from removing the row.
  let plaidRemoveStatus: "ok" | "failed" | "skipped" = "skipped";
  let plaidRemoveError: string | null = null;
  if (item.status !== "disconnected") {
    try {
      const accessToken = await getDecryptedAccessToken(item.id);
      await getPlaidClient().itemRemove({ access_token: accessToken });
      plaidRemoveStatus = "ok";
    } catch (err) {
      plaidRemoveStatus = "failed";
      plaidRemoveError = err instanceof Error ? err.message : "itemRemove failed";
    }
  }

  // Local soft-deletes via service-role client.
  const admin = createAdminClient();

  const { error: itemUpdErr } = await admin
    .from("plaid_items")
    .update({
      status: "disconnected",
      error_code: null,
      error_message: null,
    })
    .eq("id", item.id);
  if (itemUpdErr) {
    return Response.json(
      { error: `item_update_failed: ${itemUpdErr.message}` },
      { status: 500 },
    );
  }

  const { data: archivedAccounts, error: acctErr } = await admin
    .from("accounts")
    .update({ is_archived: true })
    .eq("plaid_item_id", item.id)
    .select("id");
  if (acctErr) {
    return Response.json(
      { error: `account_archive_failed: ${acctErr.message}` },
      { status: 500 },
    );
  }

  let transactionsDeleted = 0;
  if (body.wipe_transactions && archivedAccounts && archivedAccounts.length > 0) {
    const accountIds = archivedAccounts.map((a) => a.id);
    const { data: deletedRows, error: txErr } = await admin
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .in("account_id", accountIds)
      .is("deleted_at", null)
      .select("id");
    if (txErr) {
      return Response.json(
        { error: `transactions_wipe_failed: ${txErr.message}` },
        { status: 500 },
      );
    }
    transactionsDeleted = deletedRows?.length ?? 0;
  }

  await admin.from("app_events").insert({
    user_id: user.id,
    event_type: "plaid_item_disconnected",
    payload: {
      plaid_item_uuid: item.id,
      institution_name: item.institution_name,
      plaid_remove_status: plaidRemoveStatus,
      plaid_remove_error: plaidRemoveError,
      accounts_archived: archivedAccounts?.length ?? 0,
      transactions_deleted: transactionsDeleted,
      wipe_transactions: !!body.wipe_transactions,
    },
  });

  return Response.json({
    ok: true,
    plaid_remove_status: plaidRemoveStatus,
    accounts_archived: archivedAccounts?.length ?? 0,
    transactions_deleted: transactionsDeleted,
  });
}
