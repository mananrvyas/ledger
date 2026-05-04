import Link from "next/link";
import { Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  formatCurrency,
  formatShortDate,
  prettyType,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  authorized_date: string | null;
  merchant_name: string | null;
  name: string | null;
  is_pending: boolean;
};

type AccountInfo = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
};

const PAGE_SIZE = 100;

export default async function TransactionsPage() {
  const supabase = await createClient();

  const [{ data: txns, count }, { data: accounts }] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, account_id, amount, date, authorized_date, merchant_name, name, is_pending",
        { count: "exact" },
      )
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    supabase.from("accounts").select("id, name, mask, type"),
  ]);

  const rows: Row[] = txns ?? [];
  const accountList: AccountInfo[] = accounts ?? [];
  const accountById = new Map(accountList.map((a) => [a.id, a]));

  const empty = rows.length === 0;

  return (
    <div className="space-y-12">
      <header className="reveal reveal-1 space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Activity
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-5xl italic font-normal leading-[1] text-foreground">
            Transactions.
          </h1>
          <p className="font-mono text-[11px] tabular-nums tracking-[0.16em] text-muted-foreground/70">
            {count !== null && count !== undefined
              ? `showing ${rows.length} of ${count}`
              : `${rows.length} loaded`}
          </p>
        </div>
        <div className="rule-amber w-20" />
      </header>

      {empty ? (
        <section className="reveal reveal-2">
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Receipt className="size-5" strokeWidth={1.5} />
            </div>
            <h2 className="mt-5 font-display text-2xl font-normal">
              The ledger is empty.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Once you connect a bank on the{" "}
              <Link
                href="/accounts"
                className="text-foreground underline underline-offset-4 decoration-primary/50 hover:decoration-primary"
              >
                Accounts
              </Link>{" "}
              page, the first historical sync usually takes a minute or two.
            </p>
          </div>
        </section>
      ) : (
        <section className="reveal reveal-2 overflow-hidden rounded-xl border border-border bg-card">
          {/* Column header */}
          <div className="grid grid-cols-[80px_1fr_140px_120px] items-center gap-4 border-b border-hairline px-6 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            <span>Date</span>
            <span>Merchant</span>
            <span>Account</span>
            <span className="text-right">Amount</span>
          </div>
          <ul className="divide-y divide-hairline">
            {rows.map((t) => {
              const account = accountById.get(t.account_id);
              const isCredit = t.amount < 0;
              const merchant = t.merchant_name ?? t.name ?? "—";
              const subtitle =
                t.merchant_name && t.name && t.merchant_name !== t.name
                  ? t.name
                  : null;
              return (
                <li
                  key={t.id}
                  className="grid grid-cols-[80px_1fr_140px_120px] items-baseline gap-4 px-6 py-3 transition-colors hover:bg-foreground/[0.025]"
                >
                  <div className="space-y-0.5 font-mono text-[12px] tabular-nums text-muted-foreground">
                    <p className="text-foreground/85">{formatShortDate(t.date)}</p>
                    {t.is_pending ? (
                      <p className="text-[9px] uppercase tracking-[0.18em] text-amber-400/85">
                        pending
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <p className="truncate text-[14px] text-foreground">
                      {merchant}
                    </p>
                    {subtitle ? (
                      <p className="truncate font-mono text-[11px] text-muted-foreground/65">
                        {subtitle}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <p className="truncate text-[12px] text-muted-foreground">
                      {account?.name ?? "—"}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                      {account?.mask ? `···${account.mask}` : prettyType(account?.type)}
                    </p>
                  </div>

                  <p
                    className={cn(
                      "text-right font-mono tabular-nums text-[14px]",
                      isCredit ? "text-emerald-300/95" : "text-foreground/95",
                    )}
                  >
                    {isCredit
                      ? `+${formatCurrency(Math.abs(t.amount))}`
                      : formatCurrency(t.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="reveal reveal-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/40">
        categorization arrives in phase 2 · filters and search in phase 5
      </p>
    </div>
  );
}
