"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/format";

export type SpendingBarsDatum = {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  amount: number;
};

type TooltipPayloadItem = {
  value?: string | number;
  payload?: SpendingBarsDatum;
};

export function SpendingBars({ data }: { data: SpendingBarsDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground/70">
        No spending this month yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
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
          dataKey="date"
          tickFormatter={(d: string) => String(parseInt(d.slice(8, 10), 10))}
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
          tickFormatter={(v: number) => `$${Math.round(v)}`}
          tickLine={false}
          axisLine={false}
          width={48}
          tick={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
        />
        <Tooltip content={<BarsTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Bar
          dataKey="amount"
          fill="var(--chart-1)"
          radius={[3, 3, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function BarsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  if (!datum) return null;
  const d = new Date(datum.date + "T00:00:00");
  const label = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 shadow-md backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </p>
      <p className="font-mono text-[12px] tabular-nums text-foreground">
        {formatCurrency(datum.amount)}
      </p>
    </div>
  );
}
