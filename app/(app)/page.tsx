import Link from "next/link";
import { Landmark, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { StatCard } from "@/components/app/dashboard/stat-card";
import { RefreshOnMount } from "@/components/app/dashboard/refresh-on-mount";
import {
  SpendingDonut,
  type SpendingDonutDatum,
} from "@/components/app/charts/spending-donut";
import {
  SpendingBars,
  type SpendingBarsDatum,
} from "@/components/app/charts/spending-bars";
import {
  NetWorthLine,
  type NetWorthLineDatum,
} from "@/components/app/charts/net-worth-line";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NET_WORTH_DAYS = 90;

export default async function DashboardPage() {
  const supabase = await createClient();

  // ---------------------------------------------------------------------
  // Empty-state gate: load accounts (we need them for live net worth too).
  // ---------------------------------------------------------------------
  const { data: accountsRows } = await supabase
    .from("accounts")
    .select("id, type, current_balance, is_archived")
    .eq("is_archived", false);

  if (!accountsRows || accountsRows.length === 0) {
    return <EmptyDashboard />;
  }

  // ---------------------------------------------------------------------
  // Date windows
  // ---------------------------------------------------------------------
  const now = new Date();
  const startOfMonth = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const startOfLastMonth = isoDay(
    new Date(now.getFullYear(), now.getMonth() - 1, 1),
  );
  // Same day of LAST month, for an apples-to-apples month-to-date comparison.
  // Today is May 4 → lastMonthSameDay = April 4. We sum April 1–4 vs May 1–4.
  // Clamp to month-end if last month was shorter (e.g. today is Mar 31, last
  // month-same-day = Feb 28).
  const dayOfMonth = now.getDate();
  const lastMonthSameDay = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth);
    // If the new Date overflowed (e.g. Feb 30 → Mar 2), clamp to last day of
    // the previous month.
    if (d.getMonth() !== (now.getMonth() - 1 + 12) % 12) {
      return isoDay(new Date(now.getFullYear(), now.getMonth(), 0));
    }
    return isoDay(d);
  })();
  const today = isoDay(now);
  const thirtyDaysAgo = isoDay(new Date(now.getTime() - 30 * 24 * 3600_000));
  const ninetyDaysAgo = isoDay(
    new Date(now.getTime() - NET_WORTH_DAYS * 24 * 3600_000),
  );

  // ---------------------------------------------------------------------
  // Parallel fetches: spending + net worth + recent + categories
  // ---------------------------------------------------------------------
  const [
    { data: spendingRows },
    { data: netWorthRows },
    { data: recentRows },
    { data: categoryRows },
  ] = await Promise.all([
    supabase
      .from("v_spending")
      .select("date, amount, user_category")
      .gte("date", startOfLastMonth)
      .lte("date", today)
      .order("date", { ascending: true }),
    supabase
      .from("v_net_worth_daily")
      .select("date, net_worth")
      .gte("date", ninetyDaysAgo)
      .order("date", { ascending: true }),
    supabase
      .from("transactions")
      .select(
        "id, amount, effective_amount, date, merchant_name, name, user_category, is_pending, is_transfer, is_refund, split_type",
      )
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("categories")
      .select("name, color, icon, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  const categories: CategoryMeta[] = (categoryRows ?? []).map((c) => ({
    name: c.name,
    color: c.color,
    icon: c.icon,
  }));
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  // ---------------------------------------------------------------------
  // Aggregations
  // ---------------------------------------------------------------------
  const thisMonthRows = (spendingRows ?? []).filter(
    (r) => r.date != null && r.date >= startOfMonth,
  );
  // Same window of last month (Apr 1 → Apr <today's day-of-month>) for an
  // apples-to-apples comparison. The full last month total is also computed
  // for the footnote.
  const lastMonthSameWindowRows = (spendingRows ?? []).filter(
    (r) =>
      r.date != null &&
      r.date >= startOfLastMonth &&
      r.date <= lastMonthSameDay,
  );
  const lastMonthFullRows = (spendingRows ?? []).filter(
    (r) =>
      r.date != null && r.date >= startOfLastMonth && r.date < startOfMonth,
  );

  const thisMonthTotal = sumAmount(thisMonthRows);
  const lastMonthSameWindowTotal = sumAmount(lastMonthSameWindowRows);
  const lastMonthFullTotal = sumAmount(lastMonthFullRows);

  const spendingDelta =
    lastMonthSameWindowTotal > 0
      ? ((thisMonthTotal - lastMonthSameWindowTotal) /
          lastMonthSameWindowTotal) *
        100
      : null;

  // Category mix (this month). Sort largest → smallest, cap at 8 + "Other".
  const byCategory = new Map<string, number>();
  for (const r of thisMonthRows) {
    if (r.amount == null) continue;
    const key = r.user_category ?? "Uncategorized";
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(r.amount));
  }
  const donutData: SpendingDonutDatum[] = Array.from(byCategory.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      color: categoryByName.get(category)?.color ?? null,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Spending over time (this month, daily, fill missing days with 0).
  const byDate = new Map<string, number>();
  for (const r of thisMonthRows) {
    if (r.amount == null || r.date == null) continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.amount));
  }
  const barsData: SpendingBarsDatum[] = enumerateDays(startOfMonth, today).map(
    (d) => ({ date: d, amount: byDate.get(d) ?? 0 }),
  );

  // Net worth: live value computed from accounts.current_balance (refreshed
  // by every Plaid sync — see handlers/sync_plaid_item.ts). The chart's
  // historical line still comes from v_net_worth_daily snapshots; the latest
  // point is overlaid with the live value so the chart and the card agree.
  const liveNetWorth = accountsRows.reduce((acc, a) => {
    const balance = a.current_balance ?? 0;
    if (a.type === "depository" || a.type === "investment") return acc + balance;
    if (a.type === "credit" || a.type === "loan") return acc - balance;
    return acc;
  }, 0);

  const snapshotSeries = (netWorthRows ?? [])
    .filter((r) => r.date != null && r.net_worth != null)
    .map((r) => ({ date: r.date as string, net_worth: Number(r.net_worth) }));
  // Replace today's snapshot point with the live total (fresher), or append
  // it if no snapshot exists for today yet.
  const netWorthSeries: NetWorthLineDatum[] = (() => {
    const out = snapshotSeries.filter((r) => r.date !== today);
    out.push({ date: today, net_worth: liveNetWorth });
    return out;
  })();
  const latestNetWorth = liveNetWorth;
  const netWorth30d = snapshotSeries
    .slice()
    .reverse()
    .find((r) => r.date <= thirtyDaysAgo)?.net_worth;
  const netWorthDelta =
    netWorth30d != null ? latestNetWorth - netWorth30d : null;

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="space-y-12">
      <RefreshOnMount />

      <header className="reveal reveal-1 space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Overview
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-5xl italic font-normal leading-[1] text-foreground">
            Dashboard.
          </h1>
          <p className="font-mono text-[11px] tabular-nums tracking-[0.16em] text-muted-foreground/70">
            {now.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="rule-amber w-20" />
      </header>

      {/* Top stats */}
      <section className="reveal reveal-2 grid gap-4 sm:grid-cols-2">
        <StatCard
          kicker="Spent this month"
          value={formatCurrency(thisMonthTotal)}
          delta={
            spendingDelta != null
              ? {
                  label: `${spendingDelta >= 0 ? "+" : ""}${spendingDelta.toFixed(0)}% vs same window`,
                  direction:
                    spendingDelta > 0.5
                      ? "up"
                      : spendingDelta < -0.5
                        ? "down"
                        : "flat",
                }
              : null
          }
          // For spending: more is bad, less is good.
          deltaTone={
            spendingDelta == null
              ? "neutral"
              : spendingDelta > 0.5
                ? "bad"
                : spendingDelta < -0.5
                  ? "good"
                  : "neutral"
          }
          footnote={
            lastMonthSameWindowTotal > 0
              ? `${formatCurrency(lastMonthSameWindowTotal)} thru day ${dayOfMonth} last month · ${formatCurrency(lastMonthFullTotal)} full month`
              : lastMonthFullTotal > 0
                ? `no spending in last month's first ${dayOfMonth} day${dayOfMonth === 1 ? "" : "s"} · ${formatCurrency(lastMonthFullTotal)} full month`
                : "no spending last month"
          }
        />
        <StatCard
          kicker="Net worth"
          value={
            latestNetWorth != null ? formatCurrency(latestNetWorth) : "—"
          }
          delta={
            netWorthDelta != null
              ? {
                  label: `${netWorthDelta >= 0 ? "+" : ""}${formatCurrency(Math.abs(netWorthDelta))}`,
                  direction:
                    netWorthDelta > 0 ? "up" : netWorthDelta < 0 ? "down" : "flat",
                }
              : null
          }
          // For net worth: more is good.
          deltaTone={
            netWorthDelta == null
              ? "neutral"
              : netWorthDelta >= 0
                ? "good"
                : "bad"
          }
          footnote={
            netWorth30d != null
              ? "live · vs snapshot 30 days ago"
              : `live · ${snapshotSeries.length} snapshot${snapshotSeries.length === 1 ? "" : "s"} on file`
          }
        />
      </section>

      {/* Charts row 1 */}
      <section className="reveal reveal-3 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <ChartCard
          kicker="Spending by category"
          subtitle="this month"
        >
          <SpendingDonut data={donutData} total={thisMonthTotal} />
          {donutData.length > 0 ? (
            <DonutLegend data={donutData} categories={categoryByName} />
          ) : null}
        </ChartCard>
        <ChartCard kicker="Spending over time" subtitle="daily, this month">
          <SpendingBars data={barsData} />
        </ChartCard>
      </section>

      {/* Charts row 2 — full-width net worth */}
      <section className="reveal reveal-4">
        <ChartCard
          kicker="Net worth"
          subtitle={`last ${NET_WORTH_DAYS} days`}
        >
          <NetWorthLine data={netWorthSeries} />
        </ChartCard>
      </section>

      {/* Recent transactions */}
      <section className="reveal reveal-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
            Recent activity
          </p>
          <Link
            href="/transactions"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 hover:text-foreground"
          >
            view all →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {recentRows && recentRows.length > 0 ? (
            <ul className="divide-y divide-hairline">
              {recentRows.map((t) => {
                const merchant = t.merchant_name ?? t.name ?? "—";
                const isCredit = t.amount < 0;
                const displayAmount =
                  t.effective_amount != null && t.split_type !== "none"
                    ? t.effective_amount
                    : t.amount;
                const cat =
                  t.user_category && categoryByName.get(t.user_category)
                    ? categoryByName.get(t.user_category)!
                    : t.user_category
                      ? { name: t.user_category, color: null, icon: null }
                      : null;

                return (
                  <li
                    key={t.id}
                    className="grid grid-cols-[96px_1fr_180px_140px] items-baseline gap-4 px-6 py-3 transition-colors hover:bg-foreground/[0.025]"
                  >
                    <p className="font-mono text-[12px] tabular-nums text-foreground/85">
                      {formatShortDate(t.date)}
                    </p>
                    <p className="truncate text-[14px] text-foreground">
                      {merchant}
                    </p>
                    <CategoryPill category={cat} size="sm" />
                    <p
                      className={cn(
                        "text-right font-mono tabular-nums text-[14px]",
                        isCredit
                          ? "text-emerald-300/95"
                          : "text-foreground/95",
                      )}
                    >
                      {isCredit
                        ? `+${formatCurrency(Math.abs(displayAmount))}`
                        : formatCurrency(displayAmount)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center justify-center px-6 py-8 text-sm text-muted-foreground/70">
              No transactions yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local helpers + sub-components
// ---------------------------------------------------------------------------

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(isoDay(d));
  }
  return out;
}

function sumAmount(rows: { amount: number | null }[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.amount != null) total += Number(r.amount);
  }
  return total;
}

function ChartCard({
  kicker,
  subtitle,
  children,
}: {
  kicker: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
          {kicker}
        </p>
        {subtitle ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function DonutLegend({
  data,
  categories,
}: {
  data: SpendingDonutDatum[];
  categories: Map<string, CategoryMeta>;
}) {
  // Cap legend at top 6; subsume the rest into "+ N more" badge.
  const top = data.slice(0, 6);
  const remainder = data.length - top.length;
  const remainderTotal = data
    .slice(6)
    .reduce((acc, d) => acc + d.amount, 0);

  return (
    <ul className="mt-4 space-y-1.5">
      {top.map((d) => {
        const meta =
          categories.get(d.category) ?? { name: d.category, color: null, icon: null };
        return (
          <li
            key={d.category}
            className="flex items-center justify-between gap-3 text-[12px]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CategoryPill category={meta} size="sm" />
            </div>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatCurrency(d.amount)}
            </span>
          </li>
        );
      })}
      {remainder > 0 ? (
        <li className="flex items-center justify-between gap-3 pt-1 text-[12px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
            + {remainder} more
          </span>
          <span className="font-mono tabular-nums text-muted-foreground/70">
            {formatCurrency(remainderTotal)}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

function EmptyDashboard() {
  return (
    <div className="space-y-12">
      <header className="reveal reveal-1 space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Overview
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-5xl italic font-normal leading-[1] text-foreground">
            Dashboard.
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Connect a bank to see your ledger fill in.
          </p>
        </div>
        <div className="rule-amber w-20" />
      </header>

      <section className="reveal reveal-2">
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <div className="mx-auto inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Landmark className="size-5" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 font-display text-2xl font-normal">
            No accounts yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Connect a bank on the{" "}
            <Link
              href="/accounts"
              className="text-foreground underline underline-offset-4 decoration-primary/50 hover:decoration-primary"
            >
              Accounts
            </Link>{" "}
            page to start the stream.
          </p>
        </div>
      </section>

      <section className="reveal reveal-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground/70">
          <Receipt className="size-4" strokeWidth={1.5} />
          <span>Charts and cards appear once the first transactions land.</span>
        </div>
      </section>
    </div>
  );
}
