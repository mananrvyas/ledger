"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";

export type SpendingDonutDatum = {
  category: string;
  amount: number;
  /** Hex from the categories table; falls back to chart-token rotation when null. */
  color: string | null;
};

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
  payload?: SpendingDonutDatum;
};

export function SpendingDonut({
  data,
  total,
}: {
  data: SpendingDonutDatum[];
  total: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground/70">
        No spending yet this month.
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            innerRadius={68}
            outerRadius={96}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {data.map((entry, i) => (
              <Cell
                key={entry.category}
                fill={entry.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip />} cursor={false} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Total
        </p>
        <p className="font-mono text-[18px] tabular-nums text-foreground/95">
          {formatCurrency(total)}
        </p>
      </div>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  const datum = item.payload;
  if (!datum) return null;
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 shadow-md backdrop-blur-sm">
      <p className="text-[12px] text-foreground">{datum.category}</p>
      <p className="font-mono text-[12px] tabular-nums text-muted-foreground">
        {formatCurrency(datum.amount)}
      </p>
    </div>
  );
}
