import Link from "next/link";
import { Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { type CategoryMeta } from "@/components/app/category-pill";
import { RecategorizeAllButton } from "@/components/app/recategorize-all-button";
import { TestWhatsAppButton } from "@/components/app/test-whatsapp-button";
import {
  TransactionsList,
  type AccountInfo,
  type TxRow,
} from "@/components/app/transactions/transactions-list";
import { FilterBar } from "@/components/app/transactions/filter-bar";
import {
  fetchActiveAccountIds,
  fetchAttachmentTxIds,
  filterSignature,
  readTxFiltersFromSearchParams,
} from "@/lib/transaction-filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const TX_SELECT =
  "id, account_id, amount, effective_amount, date, merchant_name, name, is_pending, is_transfer, is_refund, user_category, category_source, excluded_from_stats, split_type";

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = searchParamsToURLSearchParams(sp);
  const filters = readTxFiltersFromSearchParams(params);

  const supabase = await createClient();

  let attachmentIds: string[] | null = null;
  if (filters.withAttachment) {
    const ids = await fetchAttachmentTxIds(supabase);
    attachmentIds = ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"];
  }

  // Constrain to active accounts so rows from an archived/disconnected item
  // (e.g. an old connection left behind after a re-link) don't reappear.
  const activeAccountIds = await fetchActiveAccountIds(supabase);

  let txQuery = supabase
    .from("transactions")
    .select(TX_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .in("account_id", activeAccountIds);

  if (filters.from) txQuery = txQuery.gte("date", filters.from);
  if (filters.to) txQuery = txQuery.lte("date", filters.to);
  if (filters.q) {
    const escaped = filters.q.replace(/[%,]/g, "");
    txQuery = txQuery.or(
      `merchant_name.ilike.%${escaped}%,name.ilike.%${escaped}%`,
    );
  }
  if (filters.categories.length > 0) {
    txQuery = txQuery.in("user_category", filters.categories);
  }
  if (filters.accounts.length > 0) {
    txQuery = txQuery.in("account_id", filters.accounts);
  }
  if (filters.pendingOnly) txQuery = txQuery.eq("is_pending", true);
  if (filters.hideTransfers) txQuery = txQuery.eq("is_transfer", false);
  if (filters.hideExcluded) txQuery = txQuery.eq("excluded_from_stats", false);
  if (attachmentIds) txQuery = txQuery.in("id", attachmentIds);

  txQuery = txQuery
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const [{ data: txns, count }, { data: accounts }, { data: categories }] =
    await Promise.all([
      txQuery,
      supabase
        .from("accounts")
        .select("id, name, mask, type")
        .eq("is_archived", false),
      supabase
        .from("categories")
        .select("name, color, icon, sort_order")
        .order("sort_order", { ascending: true }),
    ]);

  const rows: TxRow[] = txns ?? [];
  const accountList: AccountInfo[] = accounts ?? [];
  const categoryList: CategoryMeta[] = (categories ?? []).map((c) => ({
    name: c.name,
    color: c.color,
    icon: c.icon,
  }));

  const total = count ?? rows.length;
  const empty = rows.length === 0;
  const sig = filterSignature(filters);
  const apiQueryString = params.toString();
  const filterActive = hasAnyParams(params);

  return (
    <div className="space-y-8">
      <header className="reveal reveal-1 space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Activity
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-5xl italic font-normal leading-[1] text-foreground">
            Transactions.
          </h1>
          <div className="flex items-center gap-3">
            <p className="font-mono text-[11px] tabular-nums tracking-[0.16em] text-muted-foreground/70">
              {total > 0 ? `${total} ${total === 1 ? "entry" : "entries"}` : "—"}
            </p>
            <TestWhatsAppButton transactionId={rows[0]?.id} />
            <RecategorizeAllButton />
          </div>
        </div>
        <div className="rule-amber w-20" />
      </header>

      <section className="reveal reveal-2">
        <FilterBar categories={categoryList} accounts={accountList} />
      </section>

      {empty ? (
        <section className="reveal reveal-3">
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Receipt className="size-5" strokeWidth={1.5} />
            </div>
            <h2 className="mt-5 font-display text-2xl font-normal">
              {filterActive ? "No matches." : "The ledger is empty."}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {filterActive ? (
                <>Try widening the filters above, or clear them all.</>
              ) : (
                <>
                  Once you connect a bank on the{" "}
                  <Link
                    href="/accounts"
                    className="text-foreground underline underline-offset-4 decoration-primary/50 hover:decoration-primary"
                  >
                    Accounts
                  </Link>{" "}
                  page, the first historical sync usually takes a minute or two.
                </>
              )}
            </p>
          </div>
        </section>
      ) : (
        <section className="reveal reveal-3 overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[96px_1fr_180px_140px_140px_28px] items-center gap-4 border-b border-hairline px-6 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            <span>Date</span>
            <span>Merchant</span>
            <span>Category</span>
            <span>Account</span>
            <span className="text-right">Amount</span>
            <span className="sr-only">Actions</span>
          </div>
          <TransactionsList
            key={sig}
            initialRows={rows}
            initialTotal={total}
            pageSize={PAGE_SIZE}
            accountList={accountList}
            categoryList={categoryList}
            apiQueryString={apiQueryString}
          />
        </section>
      )}

      <p className="reveal reveal-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/40">
        <span className="text-emerald-300/80">P</span>laid ·{" "}
        <span className="text-sky-300/80">R</span>ule ·{" "}
        <span className="text-primary/80">AI</span> · <span>M</span>anual
        <span className="mx-3 text-muted-foreground/30">|</span>
        click a category to recategorize · click a row for detail
      </p>
    </div>
  );
}

function searchParamsToURLSearchParams(sp: SearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out.set(k, v);
    else if (Array.isArray(v) && v.length > 0) out.set(k, v[0]);
  }
  return out;
}

function hasAnyParams(p: URLSearchParams): boolean {
  for (const _ of p.keys()) return true;
  return false;
}
