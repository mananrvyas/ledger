import Link from "next/link";
import { Landmark, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { StatCard } from "@/components/app/dashboard/stat-card";
import { PeriodSelector } from "@/components/app/dashboard/period-selector";
import { RefreshOnMount } from "@/components/app/dashboard/refresh-on-mount";
import {
  TopMerchants,
  type TopMerchantDatum,
} from "@/components/app/dashboard/top-merchants";
import {
  LargestTransactions,
  type LargestTransactionDatum,
} from "@/components/app/dashboard/largest-transactions";
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
import {
  MonthlyTrendBars,
  type MonthlyTrendDatum,
} from "@/components/app/charts/monthly-trend-bars";
import {
  CategoryTrendArea,
  type CategoryTrendDatum,
} from "@/components/app/charts/category-trend-area";
import {
  resolvePeriod,
  isoDay,
  daysBetween,
  addDays,
  type Period,
} from "@/lib/period";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NET_WORTH_DAYS = 90;
const TREND_MONTHS = 12;
const STACKED_AREA_MONTHS = 6;
const TOP_MERCHANTS_LIMIT = 8;
const LARGEST_TX_LIMIT = 5;

type SpendRow = {
  date: string | null;
  amount: number | null;
  user_category: string | null;
};

type FullSpendRow = SpendRow & {
  id: string;
  merchant_name: string | null;
};

type IncomeRow = {
  date: string | null;
  amount: number | null;
};

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const period = resolvePeriod({
    period: typeof sp.period === "string" ? sp.period : null,
    from: typeof sp.from === "string" ? sp.from : null,
    to: typeof sp.to === "string" ? sp.to : null,
  });

  const supabase = await createClient();

  // Empty-state gate.
  const { data: accountsRows } = await supabase
    .from("accounts")
    .select("id, type, current_balance, is_archived")
    .eq("is_archived", false);

  if (!accountsRows || accountsRows.length === 0) {
    return <EmptyDashboard />;
  }

  // -------------------------------------------------------------------------
  // Date windows
  // -------------------------------------------------------------------------
  const now = new Date();
  const today = isoDay(now);
  const ninetyDaysAgo = isoDay(
    new Date(now.getTime() - NET_WORTH_DAYS * 24 * 3600_000),
  );
  const trendStart = isoDay(
    new Date(now.getFullYear(), now.getMonth() - TREND_MONTHS + 1, 1),
  );
  // Single-window fetch boundary for spending + income — covers selected
  // period, its prior comparison window, and the rolling 12-month trend.
  const earliestNeeded = period.prior
    ? period.prior.from < period.from
      ? period.prior.from
      : period.from
    : period.from;
  const fetchStart =
    earliestNeeded < trendStart ? earliestNeeded : trendStart;

  // -------------------------------------------------------------------------
  // Parallel fetches
  // -------------------------------------------------------------------------
  const [
    { data: spendingRows },
    { data: incomeRows },
    { data: netWorthRows },
    { data: recentRows },
    { data: categoryRows },
  ] = await Promise.all([
    supabase
      .from("v_spending")
      .select("id, date, amount, user_category, merchant_name")
      .gte("date", fetchStart)
      .lte("date", today)
      .order("date", { ascending: true }),
    supabase
      .from("transactions")
      .select("date, amount")
      .eq("user_category", "Income")
      .eq("excluded_from_stats", false)
      .eq("is_pending", false)
      .is("deleted_at", null)
      .gte("date", fetchStart)
      .lte("date", today),
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

  const spendRowsAll: FullSpendRow[] = (spendingRows ?? []) as FullSpendRow[];
  const incomeRowsAll: IncomeRow[] = incomeRows ?? [];

  // -------------------------------------------------------------------------
  // Period aggregations (cards + donut + daily bars + merchants + largest)
  // -------------------------------------------------------------------------
  const periodSpendRows = spendRowsAll.filter(
    (r) => r.date != null && r.date >= period.from && r.date <= period.to,
  );
  const periodIncomeRows = incomeRowsAll.filter(
    (r) => r.date != null && r.date >= period.from && r.date <= period.to,
  );

  const spentTotal = sumAmount(periodSpendRows);
  const incomeTotal = sumIncome(periodIncomeRows);
  const netFlow = incomeTotal - spentTotal; // positive = saving, negative = burning

  // Prior-window totals for deltas.
  let priorSpentTotal = 0;
  let priorIncomeTotal = 0;
  if (period.prior) {
    const ps = spendRowsAll.filter(
      (r) =>
        r.date != null &&
        r.date >= period.prior!.from &&
        r.date <= period.prior!.to,
    );
    const pi = incomeRowsAll.filter(
      (r) =>
        r.date != null &&
        r.date >= period.prior!.from &&
        r.date <= period.prior!.to,
    );
    priorSpentTotal = sumAmount(ps);
    priorIncomeTotal = sumIncome(pi);
  }
  const priorNetFlow = priorIncomeTotal - priorSpentTotal;

  const spendDelta =
    period.prior && priorSpentTotal > 0
      ? ((spentTotal - priorSpentTotal) / priorSpentTotal) * 100
      : null;
  const incomeDelta =
    period.prior && priorIncomeTotal > 0
      ? ((incomeTotal - priorIncomeTotal) / priorIncomeTotal) * 100
      : null;
  const netFlowDelta = period.prior ? netFlow - priorNetFlow : null;

  // Donut: category mix in the period.
  const byCategory = new Map<string, number>();
  for (const r of periodSpendRows) {
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

  // Daily bars: only meaningful for short periods (≤ ~2 months). For longer
  // periods we lean on the 12-month trend chart further down.
  const showDailyBars = period.days <= 62;
  const barsData: SpendingBarsDatum[] = showDailyBars
    ? buildDailyBars(periodSpendRows, period)
    : [];

  // Top merchants in period — group by merchant, sum, count, sort desc.
  const merchantBuckets = new Map<
    string,
    { total: number; count: number; rows: FullSpendRow[]; category: string | null }
  >();
  for (const r of periodSpendRows) {
    const key = (r.merchant_name ?? "—").trim() || "—";
    const bucket = merchantBuckets.get(key) ?? {
      total: 0,
      count: 0,
      rows: [],
      category: null,
    };
    bucket.total += Number(r.amount ?? 0);
    bucket.count += 1;
    bucket.rows.push(r);
    if (!bucket.category && r.user_category) bucket.category = r.user_category;
    merchantBuckets.set(key, bucket);
  }
  const topMerchants: TopMerchantDatum[] = Array.from(merchantBuckets.entries())
    .map(([merchant, b]) => ({
      merchant,
      total: b.total,
      count: b.count,
      category: b.category,
      sparkline: buildMerchantSparkline(b.rows, period),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_MERCHANTS_LIMIT);

  // Largest transactions in period.
  const largestTx: LargestTransactionDatum[] = periodSpendRows
    .slice()
    .sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))
    .slice(0, LARGEST_TX_LIMIT)
    .map((r) => ({
      id: r.id,
      date: r.date ?? today,
      merchant: (r.merchant_name ?? "—").trim() || "—",
      category: r.user_category,
      amount: Number(r.amount ?? 0),
    }));

  // Pace projection — only meaningful for this_month.
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const monthlyPace =
    period.key === "this_month" && dayOfMonth > 0
      ? (spentTotal / dayOfMonth) * daysInMonth
      : null;

  // -------------------------------------------------------------------------
  // 12-month trend (bars) + 6-month category area
  // -------------------------------------------------------------------------
  const monthlyTrend = buildMonthlyTrend(spendRowsAll, incomeRowsAll, now);
  const stackedArea = buildCategoryStackedArea(
    spendRowsAll,
    now,
    categoryByName,
  );

  // -------------------------------------------------------------------------
  // Net worth: live + 90-day chart
  // -------------------------------------------------------------------------
  const liveNetWorth = accountsRows.reduce((acc, a) => {
    const balance = a.current_balance ?? 0;
    if (a.type === "depository" || a.type === "investment") return acc + balance;
    if (a.type === "credit" || a.type === "loan") return acc - balance;
    return acc;
  }, 0);

  const snapshotSeries = (netWorthRows ?? [])
    .filter((r) => r.date != null && r.net_worth != null)
    .map((r) => ({ date: r.date as string, net_worth: Number(r.net_worth) }));
  const netWorthSeries: NetWorthLineDatum[] = (() => {
    const out = snapshotSeries.filter((r) => r.date !== today);
    out.push({ date: today, net_worth: liveNetWorth });
    return out;
  })();
  const thirtyDaysAgo = isoDay(new Date(now.getTime() - 30 * 24 * 3600_000));
  const netWorth30d = snapshotSeries
    .slice()
    .reverse()
    .find((r) => r.date <= thirtyDaysAgo)?.net_worth;
  const netWorthDelta =
    netWorth30d != null ? liveNetWorth - netWorth30d : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
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
          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector current={period.key} isCustom={period.isCustom} />
          </div>
        </div>
        <p className="font-mono text-[11px] tabular-nums tracking-[0.16em] text-muted-foreground/70">
          {period.label} ·{" "}
          {period.from === period.to
            ? formatShortDate(period.from)
            : `${formatShortDate(period.from)} → ${formatShortDate(period.to)}`}
        </p>
        <div className="rule-amber w-20" />
      </header>

      {/* Top stats — 3 cards. */}
      <section className="reveal reveal-2 grid gap-4 sm:grid-cols-3">
        <StatCard
          kicker="Spent"
          value={formatCurrency(spentTotal)}
          delta={
            spendDelta != null
              ? {
                  label: `${spendDelta >= 0 ? "+" : ""}${spendDelta.toFixed(0)}%`,
                  direction:
                    spendDelta > 0.5 ? "up" : spendDelta < -0.5 ? "down" : "flat",
                }
              : null
          }
          deltaTone={
            spendDelta == null
              ? "neutral"
              : spendDelta > 0.5
                ? "bad"
                : spendDelta < -0.5
                  ? "good"
                  : "neutral"
          }
          footnote={spendFootnote({
            period,
            priorSpentTotal,
            monthlyPace,
          })}
        />
        <StatCard
          kicker="Income"
          value={formatCurrency(incomeTotal)}
          delta={
            incomeDelta != null
              ? {
                  label: `${incomeDelta >= 0 ? "+" : ""}${incomeDelta.toFixed(0)}%`,
                  direction:
                    incomeDelta > 0.5
                      ? "up"
                      : incomeDelta < -0.5
                        ? "down"
                        : "flat",
                }
              : null
          }
          deltaTone={
            incomeDelta == null
              ? "neutral"
              : incomeDelta >= -0.5
                ? "good"
                : "bad"
          }
          footnote={
            period.prior && priorIncomeTotal > 0
              ? `${formatCurrency(priorIncomeTotal)} prior period`
              : incomeTotal === 0
                ? "no income tagged"
                : "first period — no prior"
          }
        />
        <StatCard
          kicker="Net cash flow"
          value={`${netFlow >= 0 ? "+" : "−"}${formatCurrency(Math.abs(netFlow))}`}
          delta={
            netFlowDelta != null
              ? {
                  label: `${netFlowDelta >= 0 ? "+" : "−"}${formatCurrency(Math.abs(netFlowDelta))}`,
                  direction:
                    netFlowDelta > 0
                      ? "up"
                      : netFlowDelta < 0
                        ? "down"
                        : "flat",
                }
              : null
          }
          deltaTone={
            netFlowDelta == null
              ? "neutral"
              : netFlowDelta >= 0
                ? "good"
                : "bad"
          }
          footnote={
            netFlow >= 0
              ? `saving · income covered spend`
              : `burning · spend exceeded income`
          }
        />
      </section>

      {/* Net worth + spending donut row. */}
      <section className="reveal reveal-3 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <ChartCard kicker="Spending by category" subtitle={period.label.toLowerCase()}>
          <SpendingDonut data={donutData} total={spentTotal} />
          {donutData.length > 0 ? (
            <DonutLegend data={donutData} categories={categoryByName} />
          ) : null}
        </ChartCard>
        <ChartCard
          kicker={showDailyBars ? "Spending over time" : "Net worth"}
          subtitle={
            showDailyBars
              ? period.days <= 31
                ? "daily, this period"
                : "daily, this period"
              : `last ${NET_WORTH_DAYS} days`
          }
        >
          {showDailyBars ? (
            <SpendingBars data={barsData} />
          ) : (
            <NetWorthLine data={netWorthSeries} />
          )}
        </ChartCard>
      </section>

      {/* Top merchants + largest tx row. */}
      <section className="reveal reveal-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          kicker="Top merchants"
          subtitle={`top ${TOP_MERCHANTS_LIMIT} by spend`}
        >
          <TopMerchants data={topMerchants} categoryByName={categoryByName} />
        </ChartCard>
        <ChartCard
          kicker="Largest transactions"
          subtitle={`top ${LARGEST_TX_LIMIT} this period`}
        >
          <LargestTransactions
            data={largestTx}
            categoryByName={categoryByName}
          />
        </ChartCard>
      </section>

      {/* Monthly trend (always 12mo) — 2-up: spend vs net cash flow. */}
      <section className="reveal reveal-5 grid gap-4 lg:grid-cols-2">
        <ChartCard kicker="Monthly spend" subtitle="last 12 months">
          <MonthlyTrendBars data={monthlyTrend} mode="spent" />
        </ChartCard>
        <ChartCard kicker="Net cash flow" subtitle="last 12 months · spent − income">
          <MonthlyTrendBars data={monthlyTrend} mode="net" />
        </ChartCard>
      </section>

      {/* Category trend — full-width stacked area. */}
      <section className="reveal reveal-6">
        <ChartCard
          kicker="Where it goes"
          subtitle={`stacked, last ${STACKED_AREA_MONTHS} months`}
        >
          <CategoryTrendArea
            data={stackedArea.data}
            series={stackedArea.series}
            categoryByName={categoryByName}
          />
        </ChartCard>
      </section>

      {/* Daily bars on long periods we hid up top — show net worth in its own
          full-width slot since the upper card flipped to net worth there. */}
      {showDailyBars ? (
        <section className="reveal reveal-7">
          <ChartCard kicker="Net worth" subtitle={`last ${NET_WORTH_DAYS} days`}>
            <NetWorthLine data={netWorthSeries} />
          </ChartCard>
          <p className="mt-2 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
            {liveNetWorth != null ? `live · ${formatCurrency(liveNetWorth)}` : ""}
            {netWorthDelta != null
              ? ` · ${netWorthDelta >= 0 ? "+" : "−"}${formatCurrency(Math.abs(netWorthDelta))} 30d`
              : ""}
          </p>
        </section>
      ) : null}

      {/* Recent transactions */}
      <section className="reveal reveal-8 space-y-4">
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
                  <li key={t.id}>
                    <Link
                      href={`/transactions/${t.id}`}
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
                    </Link>
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
// Aggregation helpers
// ---------------------------------------------------------------------------

function sumAmount(rows: { amount: number | null }[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.amount != null) total += Number(r.amount);
  }
  return total;
}

/**
 * Income amounts come from `transactions`, where Plaid convention is negative
 * for inflows. Negate to express as a positive "income total."
 */
function sumIncome(rows: { amount: number | null }[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.amount != null) total -= Number(r.amount);
  }
  return total;
}

function buildDailyBars(rows: SpendRow[], period: Period): SpendingBarsDatum[] {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (r.amount == null || r.date == null) continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.amount));
  }
  const out: SpendingBarsDatum[] = [];
  const start = new Date(period.from + "T00:00:00");
  const end = new Date(period.to + "T00:00:00");
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = isoDay(d);
    out.push({ date: key, amount: byDate.get(key) ?? 0 });
  }
  return out;
}

/**
 * Build a 6-bucket sparkline for a single merchant's transactions across the
 * selected period. Returns an empty array when there isn't enough range
 * (period < 6 days OR fewer than 2 transactions).
 */
function buildMerchantSparkline(rows: SpendRow[], period: Period): number[] {
  const days = daysBetween(period.from, period.to);
  if (days < 6 || rows.length < 2) return [];
  const buckets = 6;
  const bucketDays = days / buckets;
  const totals = new Array<number>(buckets).fill(0);
  const start = new Date(period.from + "T00:00:00").getTime();
  for (const r of rows) {
    if (r.date == null || r.amount == null) continue;
    const t = new Date(r.date + "T00:00:00").getTime();
    const dayOffset = (t - start) / 86_400_000;
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(dayOffset / bucketDays)));
    totals[idx] += Number(r.amount);
  }
  return totals;
}

function buildMonthlyTrend(
  spendingRows: SpendRow[],
  incomeRows: IncomeRow[],
  now: Date,
): MonthlyTrendDatum[] {
  const months: { month: string; spent: number; income: number }[] = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: isoDay(dt), spent: 0, income: 0 });
  }
  const monthIndex = new Map(months.map((m, i) => [m.month, i]));

  for (const r of spendingRows) {
    if (r.date == null || r.amount == null) continue;
    const monthKey = monthFromDate(r.date);
    const idx = monthIndex.get(monthKey);
    if (idx != null) months[idx].spent += Number(r.amount);
  }
  for (const r of incomeRows) {
    if (r.date == null || r.amount == null) continue;
    const monthKey = monthFromDate(r.date);
    const idx = monthIndex.get(monthKey);
    if (idx != null) months[idx].income += -Number(r.amount); // negate
  }

  return months.map((m) => ({
    month: m.month,
    spent: m.spent,
    income: m.income,
    net: m.spent - m.income,
  }));
}

function buildCategoryStackedArea(
  spendingRows: SpendRow[],
  now: Date,
  categoryByName: Map<string, CategoryMeta>,
): {
  data: CategoryTrendDatum[];
  series: { name: string; color: string | null }[];
} {
  // Window: last 6 calendar months ending in the current month.
  const windowStart = new Date(
    now.getFullYear(),
    now.getMonth() - STACKED_AREA_MONTHS + 1,
    1,
  );
  const windowMonths: string[] = [];
  for (let i = STACKED_AREA_MONTHS - 1; i >= 0; i--) {
    windowMonths.push(
      isoDay(new Date(now.getFullYear(), now.getMonth() - i, 1)),
    );
  }
  const monthIndex = new Map(windowMonths.map((m, i) => [m, i]));
  const eligibleStart = isoDay(windowStart);

  const inWindow = spendingRows.filter(
    (r) => r.date != null && r.date >= eligibleStart,
  );

  // Tally each category's grand total over the window — used to pick the
  // "top N" series. Everything else is folded into "Other" so the chart
  // doesn't shatter into 19 layers.
  const totals = new Map<string, number>();
  for (const r of inWindow) {
    if (r.amount == null) continue;
    const k = r.user_category ?? "Uncategorized";
    totals.set(k, (totals.get(k) ?? 0) + Number(r.amount));
  }
  const ordered = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v > 0);

  const TOP_N = 5;
  const topCats = ordered.slice(0, TOP_N).map(([name]) => name);
  const hasOther = ordered.length > TOP_N;
  const seriesNames = hasOther ? [...topCats, "Other"] : topCats;

  // Build per-month buckets keyed by category.
  const buckets = windowMonths.map<{ [key: string]: number | string }>((m) => {
    const obj: { [key: string]: number | string } = { month: m };
    for (const c of seriesNames) obj[c] = 0;
    return obj;
  });

  for (const r of inWindow) {
    if (r.amount == null || r.date == null) continue;
    const monthKey = monthFromDate(r.date);
    const idx = monthIndex.get(monthKey);
    if (idx == null) continue;
    const cat = r.user_category ?? "Uncategorized";
    const targetKey = topCats.includes(cat) ? cat : hasOther ? "Other" : cat;
    if (!seriesNames.includes(targetKey)) continue;
    const cur = buckets[idx][targetKey];
    buckets[idx][targetKey] =
      (typeof cur === "number" ? cur : 0) + Number(r.amount);
  }

  // Stack order: smallest series at the bottom, "Other" on top so the
  // categories the user cares about anchor to the X-axis.
  const orderedSeries = topCats
    .slice()
    .reverse()
    .concat(hasOther ? ["Other"] : []);

  return {
    data: buckets as CategoryTrendDatum[],
    series: orderedSeries.map((name) => ({
      name,
      color: categoryByName.get(name)?.color ?? null,
    })),
  };
}

function monthFromDate(iso: string): string {
  // "2026-05-08" → "2026-05-01"
  return iso.slice(0, 7) + "-01";
}

function spendFootnote(args: {
  period: Period;
  priorSpentTotal: number;
  monthlyPace: number | null;
}): string {
  const parts: string[] = [];
  if (args.monthlyPace != null && args.monthlyPace > 0) {
    parts.push(`pace ${formatCurrency(args.monthlyPace)} by EOM`);
  }
  if (args.period.prior) {
    if (args.priorSpentTotal > 0) {
      parts.push(`${formatCurrency(args.priorSpentTotal)} prior`);
    } else {
      parts.push(`no spend prior period`);
    }
  } else {
    parts.push(`all-time view`);
  }
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
  const top = data.slice(0, 6);
  const remainder = data.length - top.length;
  const remainderTotal = data.slice(6).reduce((acc, d) => acc + d.amount, 0);

  return (
    <ul className="mt-4 space-y-1.5">
      {top.map((d) => {
        const meta =
          categories.get(d.category) ?? {
            name: d.category,
            color: null,
            icon: null,
          };
        return (
          <li
            key={d.category}
            className="flex items-center justify-between gap-3 text-[12px]"
          >
            <Link
              href={`/transactions?categories=${encodeURIComponent(d.category)}`}
              className="flex min-w-0 items-center gap-2 hover:underline"
            >
              <CategoryPill category={meta} size="sm" />
            </Link>
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
