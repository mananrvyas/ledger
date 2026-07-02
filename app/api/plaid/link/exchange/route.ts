import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { getDecryptedAccessToken, storePlaidItem } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid";
import { publishJob } from "@/lib/qstash";

type ExchangeRequest = {
  public_token?: string;
  metadata?: {
    institution?: { institution_id?: string; name?: string };
  };
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ExchangeRequest;
  try {
    body = (await request.json()) as ExchangeRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const publicToken = body.public_token;
  if (!publicToken) {
    return Response.json({ error: "public_token required" }, { status: 400 });
  }

  const plaid = getPlaidClient();

  try {
    // 1) Exchange public token for access token + item_id.
    const exchangeResp = await plaid.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeResp.data.access_token;
    const itemId = exchangeResp.data.item_id;

    // 2) Encrypt and persist the Plaid item via the SECURITY DEFINER RPC.
    const stored = await storePlaidItem({
      userId: user.id,
      accessToken,
      itemId,
      institutionId: body.metadata?.institution?.institution_id ?? "",
      institutionName: body.metadata?.institution?.name ?? "",
    });

    // 3) Fetch accounts and persist them. Use admin client to keep this single
    //    request fast (we already verified the user above; user_id is set
    //    explicitly on each row).
    const accountsResp = await plaid.accountsGet({ access_token: accessToken });
    const admin = createAdminClient();
    const accountRows = accountsResp.data.accounts.map((a) => ({
      plaid_item_id: stored.id,
      user_id: user.id,
      plaid_account_id: a.account_id,
      name: a.name,
      official_name: a.official_name ?? null,
      mask: a.mask ?? null,
      type: a.type,
      subtype: a.subtype ?? null,
      currency: a.balances.iso_currency_code ?? "USD",
      current_balance: a.balances.current ?? null,
      available_balance: a.balances.available ?? null,
      credit_limit: a.balances.limit ?? null,
      raw: a as unknown as Json,
    }));

    // Plain insert — `accounts.plaid_account_id` has a partial unique index
    // (`WHERE is_archived = false`, see migration 0009). PostgREST can't
    // address a partial index from `onConflict`, so an upsert here would
    // throw "no unique or exclusion constraint matching the ON CONFLICT
    // specification" even when the partial index is satisfied. A re-link
    // that follows a disconnect+wipe leaves the previous accounts archived,
    // so a fresh insert with the same plaid_account_id passes the partial
    // check cleanly. If a user somehow has the same active plaid_account_id
    // (e.g. linked the same bank twice without disconnecting), the partial
    // index throws 23505 and we surface it as a clean error.
    if (accountRows.length > 0) {
      const { error: accErr } = await admin
        .from("accounts")
        .insert(accountRows);
      if (accErr) {
        // Clean up the just-inserted plaid_items row so we don't leave a
        // stranded item with no children.
        await admin.from("plaid_items").delete().eq("id", stored.id);
        const friendly =
          accErr.code === "23505"
            ? "An account from this institution is already linked. Disconnect it first."
            : `accounts insert failed: ${accErr.message}`;
        return Response.json({ error: friendly }, { status: 500 });
      }
    }

    // 3b) Replace any prior ACTIVE item for this same institution. Re-linking a
    //     bank through the normal "add bank" flow (rather than the Reconnect
    //     button) would otherwise leave the old item active alongside the new
    //     one — both keep syncing the same accounts and every transaction shows
    //     up twice. Archive the predecessors: best-effort Plaid itemRemove,
    //     mark disconnected, archive their accounts (history preserved but the
    //     transaction list hides archived-account rows).
    const institutionId = stored.institution_id ?? "";
    let priorQuery = admin
      .from("plaid_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .neq("id", stored.id);
    priorQuery = institutionId
      ? priorQuery.eq("institution_id", institutionId)
      : priorQuery.eq(
          "institution_name",
          stored.institution_name ?? "",
        );
    const { data: priorItems } = await priorQuery;

    for (const prior of priorItems ?? []) {
      try {
        const oldToken = await getDecryptedAccessToken(prior.id);
        await plaid.itemRemove({ access_token: oldToken });
      } catch {
        // Token may be expired/invalid; keep going with the local archive.
      }
      await admin
        .from("plaid_items")
        .update({ status: "disconnected", error_code: null, error_message: null })
        .eq("id", prior.id);
      await admin
        .from("accounts")
        .update({ is_archived: true })
        .eq("plaid_item_id", prior.id);
      await admin.from("app_events").insert({
        user_id: user.id,
        event_type: "plaid_item_replaced_on_relink",
        payload: {
          old_item_uuid: prior.id,
          new_item_uuid: stored.id,
          institution_name: stored.institution_name,
        },
      });
    }

    // 4) Enqueue the initial historical sync. Idempotency key is the item id —
    //    duplicate calls for the same item collapse via the worker's skip
    //    check (which compares cursor before doing work).
    await publishJob({
      type: "sync_plaid_item",
      idempotency_key: `init-sync-${stored.id}`,
      payload: { plaid_item_id: stored.id },
    });

    return Response.json({
      plaid_item_id: stored.id,
      institution_name: stored.institution_name,
      account_count: accountRows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Exchange failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
