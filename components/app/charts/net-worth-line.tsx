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
import { formatCurrency } from "@/lib/format";

export type NetWorthLineDatum = {
  date: string;
  net_worth: number;
};

type TooltipPayloadItem = {
  value?: string | number;
  payload?: NetWorthLineDatum;
};

export function NetWorthLine({ data }: { data: NetWorthLineDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground/70">
        Net-worth snapshots build up daily — check back tomorrow.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="2 4"
          stroke="var(--hairline)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => {
            const dt = new Date(d + "T00:00:00");
            return dt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
          }}
          interval="preserveStartEnd"
          minTickGap={48}
          tickLine={false}
          axisLine={{ stroke: "var(--hairline)" }}
          tick={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
        />
        <YAxis
          tickFormatter={(v: number) => formatCompactCurrency(v)}
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
          domain={["auto", "auto"]}
        />
        <Tooltip
          content={<NetWorthTooltip />}
          cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="net_worth"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#nwFill)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function formatCompactCurrency(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

function NetWorthTooltip({
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
    year: "numeric",
  });
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 shadow-md backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </p>
      <p className="font-mono text-[12px] tabular-nums text-foreground">
        {formatCurrency(datum.net_worth)}
      </p>
    </div>
  );
}
