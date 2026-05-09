"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { formatCurrency } from "@/lib/format";

export type CategoryTrendDatum = {
  /** ISO `YYYY-MM-01`. */
  month: string;
} & Record<string, number | string>;

const FALLBACK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type TooltipPayloadItem = {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string;
};

/**
 * Stacked area showing each category's spend month-over-month. The series
 * are passed in already sorted (largest total first). The "Other" bucket
 * sits at the top so categories of interest stay close to the X-axis.
 */
export function CategoryTrendArea({
  data,
  series,
  categoryByName,
}: {
  data: CategoryTrendDatum[];
  /** Categories to render as stacked layers, in stack order (bottom → top). */
  series: { name: string; color: string | null }[];
  categoryByName: Map<string, CategoryMeta>;
}) {
  if (data.length === 0 || series.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground/70">
        Not enough data to draw a trend yet.
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
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
            tickFormatter={(d: string) => {
              const dt = new Date(d + "T00:00:00");
              return dt.toLocaleDateString(undefined, { month: "short" });
            }}
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
            content={<TrendTooltip />}
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
          />
          {series.map((s, i) => {
            const color = s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
            return (
              <Area
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stackId="cat"
                stroke={color}
                strokeWidth={1}
                fill={color}
                fillOpacity={0.55}
                isAnimationActive={false}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend below — uses the same category pills the rest of the app uses. */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => {
          const meta =
            categoryByName.get(s.name) ?? {
              name: s.name,
              color: s.color,
              icon: null,
            };
          return (
            <li key={s.name}>
              <CategoryPill category={meta} size="sm" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const dt = new Date(label + "T00:00:00");
  const monthLabel = dt.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  // Sum across stacked layers for a "total this month" line.
  const total = payload.reduce(
    (acc, p) => acc + (typeof p.value === "number" ? p.value : 0),
    0,
  );

  // Filter zero-spend layers so the tooltip doesn't get cluttered.
  const nonzero = payload.filter(
    (p) => typeof p.value === "number" && p.value > 0,
  );

  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 shadow-md backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {monthLabel}
      </p>
      <p className="font-mono text-[12px] tabular-nums text-foreground">
        {formatCurrency(total)}
      </p>
      {nonzero.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {nonzero
            .slice()
            .sort((a, b) =>
              typeof b.value === "number" && typeof a.value === "number"
                ? b.value - a.value
                : 0,
            )
            .slice(0, 5)
            .map((p) => (
              <li
                key={String(p.dataKey)}
                className="flex items-center justify-between gap-3 font-mono text-[10px] tabular-nums"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="text-muted-foreground">{p.dataKey}</span>
                </span>
                <span className="text-foreground/85">
                  {formatCurrency(typeof p.value === "number" ? p.value : 0)}
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
