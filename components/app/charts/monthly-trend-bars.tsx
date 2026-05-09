"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatCurrency } from "@/lib/format";

export type MonthlyTrendDatum = {
  /** ISO `YYYY-MM-01`. */
  month: string;
  spent: number;
  income: number;
  /** spent − income (positive when burning, negative when saving). */
  net: number;
};

type TooltipPayloadItem = {
  value?: string | number;
  payload?: MonthlyTrendDatum;
};

/**
 * 12-month spend + net cash-flow bars. Shows whether the user is trending up
 * or down month-over-month. Net bars switch colors: emerald when income
 * exceeds spend (a saving month), rose when burning. The most recent month
 * is rendered slightly dimmed since it's still in progress.
 */
export function MonthlyTrendBars({
  data,
  mode = "spent",
}: {
  data: MonthlyTrendDatum[];
  /** Which series to render. */
  mode?: "spent" | "net";
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground/70">
        Not enough months of history yet.
      </div>
    );
  }

  const dataKey = mode;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="2 4"
          stroke="var(--hairline)"
          vertical={false}
        />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonthTick}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={{ stroke: "var(--hairline)" }}
          tick={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
        />
        <YAxis
          tickFormatter={(v: number) => formatCompact(v)}
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
        />
        <Tooltip
          content={<MonthlyTooltip mode={mode} />}
          cursor={{ fill: "var(--muted)" }}
        />
        <Bar dataKey={dataKey} radius={[3, 3, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => {
            const isLast = i === data.length - 1;
            let color = "var(--chart-1)";
            if (mode === "net") {
              color = d.net >= 0 ? "var(--chart-2)" : "var(--chart-3)";
            }
            return (
              <Cell
                key={d.month}
                fill={color}
                fillOpacity={isLast ? 0.55 : 1}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function formatMonthTick(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short" });
}

function formatCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function MonthlyTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  mode: "spent" | "net";
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  if (!datum) return null;
  const dt = new Date(datum.month + "T00:00:00");
  const label = dt.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 shadow-md backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </p>
      <p className="font-mono text-[12px] tabular-nums text-foreground">
        {mode === "spent"
          ? formatCurrency(datum.spent)
          : `${datum.net >= 0 ? "+" : ""}${formatCurrency(datum.net)}`}
      </p>
      {mode === "spent" && datum.income > 0 ? (
        <p className="font-mono text-[10px] tabular-nums text-emerald-300/80">
          +{formatCurrency(datum.income)} in
        </p>
      ) : null}
    </div>
  );
}
