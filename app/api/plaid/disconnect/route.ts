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
 * etc.). Then locally:
 *
 *   wipe_transactions = false (default)
 *     - plaid_items.status = 'disconnected'
 *     - accounts.is_archived = true (history preserved, dashboard hides them)
 *
 *   wipe_transactions = true
 *     - HARD DELETE plaid_items row → cascades to accounts → cascades to
 *       transactions → cascades to balance_snapshots + attachments.
 *       Frees the plaid_account_ids cleanly so the same bank can be
 *       re-linked with no leftover constraint surface.
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

  const admin = createAdminClient();

  // Pre-count children for the audit log + UI confirmation message, since a
  // hard delete removes the rows we'd otherwise count.
  const { data: accountsForItem } = await admin
    .from("accounts")
    .select("id")
    .eq("plaid_item_id", item.id);
  const accountIds = (accountsForItem ?? []).map((a) => a.id);

  let txCount = 0;
  if (accountIds.length > 0) {
    const { count } = await admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .in("account_id", accountIds)
      .is("deleted_at", null);
    txCount = count ?? 0;
  }

  if (body.wipe_transactions) {
    // Hard delete the item. FKs cascade:
    //   plaid_items → accounts → transactions → (balance_snapshots,
    //                                            transaction_attachments)
    // category_rules and app_events have no FK and are kept (rules are
    // merchant-keyed, useful even after a re-link).
    const { error: delErr } = await admin
      .from("plaid_items")
      .delete()
      .eq("id", item.id);
    if (delErr) {
      return Response.json(
        { error: `item_delete_failed: ${delErr.message}` },
        { status: 500 },
      );
    }

    await admin.from("app_events").insert({
      user_id: user.id,
      event_type: "plaid_item_deleted",
      payload: {
        plaid_item_uuid: item.id,
        institution_name: item.institution_name,
        plaid_remove_status: plaidRemoveStatus,
        plaid_remove_error: plaidRemoveError,
        accounts_deleted: accountIds.length,
        transactions_deleted: txCount,
        wipe_transactions: true,
      },
    });

    return Response.json({
      ok: true,
      plaid_remove_status: plaidRemoveStatus,
      accounts_archived: accountIds.length,
      transactions_deleted: txCount,
      hard_deleted: true,
    });
  }

  // Soft-archive path: keep history, mark item disconnected, archive accounts.
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

  const { error: acctErr } = await admin
    .from("accounts")
    .update({ is_archived: true })
    .eq("plaid_item_id", item.id);
  if (acctErr) {
    return Response.json(
      { error: `account_archive_failed: ${acctErr.message}` },
      { status: 500 },
    );
  }

  await admin.from("app_events").insert({
    user_id: user.id,
    event_type: "plaid_item_disconnected",
    payload: {
      plaid_item_uuid: item.id,
      institution_name: item.institution_name,
      plaid_remove_status: plaidRemoveStatus,
      plaid_remove_error: plaidRemoveError,
      accounts_archived: accountIds.length,
      transactions_deleted: 0,
      wipe_transactions: false,
    },
  });

  return Response.json({
    ok: true,
    plaid_remove_status: plaidRemoveStatus,
    accounts_archived: accountIds.length,
    transactions_deleted: 0,
  });
}
