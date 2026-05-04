import { Landmark, AlertTriangle, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PlaidLinkButton } from "@/components/plaid/plaid-link-button";
import {
  formatCurrency,
  formatRelative,
  prettyType,
} from "@/lib/format";

type AccountRow = {
  id: string;
  plaid_item_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  currency: string;
};

type ItemRow = {
  id: string;
  institution_name: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  last_synced_at: string | null;
  created_at: string;
};

export default async function AccountsPage() {
  const supabase = await createClient();

  const [{ data: items }, { data: accounts }] = await Promise.all([
    supabase
      .from("plaid_items")
      .select(
        "id, institution_name, status, error_code, error_message, last_synced_at, created_at",
      )
      .neq("status", "disconnected")
      .order("created_at", { ascending: true }),
    supabase
      .from("accounts")
      .select(
        "id, plaid_item_id, name, official_name, mask, type, subtype, current_balance, available_balance, credit_limit, currency",
      )
      .eq("is_archived", false)
      .order("name", { ascending: true }),
  ]);

  const itemList: ItemRow[] = items ?? [];
  const accountList: AccountRow[] = accounts ?? [];

  const accountsByItem = new Map<string, AccountRow[]>();
  for (const acc of accountList) {
    const list = accountsByItem.get(acc.plaid_item_id) ?? [];
    list.push(acc);
    accountsByItem.set(acc.plaid_item_id, list);
  }

  const empty = itemList.length === 0;

  return (
    <div className="space-y-12">
      <header className="reveal reveal-1 space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Connected institutions
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-5xl italic font-normal leading-[1] text-foreground">
            Accounts.
          </h1>
          <PlaidLinkButton size="default" />
        </div>
        <div className="rule-amber w-20" />
      </header>

      {empty ? (
        <section className="reveal reveal-2">
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Landmark className="size-5" strokeWidth={1.5} />
            </div>
            <h2 className="mt-5 font-display text-2xl font-normal">
              No banks yet.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Connecting a bank starts a real-time stream of transactions into
              your ledger. Up to five institutions on the current Plaid tier.
            </p>
            <div className="mt-6 inline-flex">
              <PlaidLinkButton />
            </div>
          </div>
        </section>
      ) : (
        <section className="reveal reveal-2 space-y-6">
          {itemList.map((item, idx) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline px-6 py-5">
                <div className="space-y-1">
                  <h3 className="font-display text-xl font-normal leading-tight">
                    {item.institution_name ?? "Unknown institution"}
                  </h3>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    {item.status === "active" ? (
                      <span className="text-muted-foreground">
                        synced {formatRelative(item.last_synced_at)}
                      </span>
                    ) : item.status === "requires_login" ? (
                      <span className="text-amber-400">login required</span>
                    ) : (
                      <span className="text-destructive">
                        {item.status}
                        {item.error_code ? ` · ${item.error_code}` : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.status === "requires_login" ? (
                    <PlaidLinkButton
                      reconnectItemId={item.id}
                      variant="outline"
                      size="sm"
                      label="Reconnect"
                    />
                  ) : null}
                  <span
                    className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/40"
                    title="Item index"
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                </div>
              </div>

              {item.status === "requires_login" ||
              item.error_message ? (
                <div className="flex items-start gap-3 border-b border-hairline bg-destructive/[0.04] px-6 py-4">
                  <AlertTriangle
                    className="mt-0.5 size-4 text-destructive"
                    strokeWidth={1.5}
                  />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-foreground">
                      {item.error_code ?? "Reconnect required"}
                    </p>
                    <p className="text-muted-foreground">
                      {item.error_message ??
                        "Plaid lost access to this institution. Reconnect to resume syncing."}
                    </p>
                  </div>
                </div>
              ) : null}

              <ul className="divide-y divide-hairline">
                {(accountsByItem.get(item.id) ?? []).map((acc) => (
                  <li
                    key={acc.id}
                    className="grid grid-cols-[1fr_auto] items-baseline gap-4 px-6 py-4 sm:grid-cols-[1.5fr_1fr_auto]"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium text-[15px]">{acc.name}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
                        {prettyType(acc.subtype ?? acc.type)}
                        {acc.mask ? ` · ···${acc.mask}` : ""}
                      </p>
                    </div>
                    <p className="hidden text-[12px] text-muted-foreground sm:block">
                      {acc.official_name ?? ""}
                    </p>
                    <p className="font-mono text-base tabular-nums text-foreground/95">
                      {formatCurrency(acc.current_balance)}
                    </p>
                  </li>
                ))}
                {(accountsByItem.get(item.id) ?? []).length === 0 ? (
                  <li className="px-6 py-5 text-sm text-muted-foreground">
                    No accounts yet. First sync may still be pending.
                  </li>
                ) : null}
              </ul>
            </article>
          ))}
        </section>
      )}

      <p className="reveal reveal-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/40">
        <RefreshCw
          className="mr-1.5 inline size-3"
          strokeWidth={1.5}
          aria-hidden
        />
        balances refresh hourly
      </p>
    </div>
  );
}
