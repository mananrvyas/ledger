import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { storePlaidItem } from "@/lib/encryption";
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

    if (accountRows.length > 0) {
      const { error: accErr } = await admin
        .from("accounts")
        .upsert(accountRows, { onConflict: "plaid_account_id" });
      if (accErr) {
        return Response.json(
          { error: `accounts insert failed: ${accErr.message}` },
          { status: 500 },
        );
      }
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
