import Link from "next/link";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { formatCurrency } from "@/lib/format";

export type TopMerchantDatum = {
  merchant: string;
  category: string | null;
  total: number;
  count: number;
  /** Spend per bucket within the period (oldest → newest). Empty if not enough range. */
  sparkline: number[];
};

/**
 * Top merchants by total spend in the selected period. Each row links into
 * /transactions filtered to that merchant; the optional sparkline shows how
 * spend on this merchant trended within the period.
 */
export function TopMerchants({
  data,
  categoryByName,
}: {
  data: TopMerchantDatum[];
  categoryByName: Map<string, CategoryMeta>;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground/70">
        No merchants in this period.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.total));

  return (
    <ul className="divide-y divide-hairline">
      {data.map((d) => {
        const meta =
          d.category && categoryByName.get(d.category)
            ? categoryByName.get(d.category)!
            : d.category
              ? { name: d.category, color: null, icon: null }
              : null;
        const pct = max > 0 ? (d.total / max) * 100 : 0;
        return (
          <li key={d.merchant} className="px-1 py-2.5">
            <Link
              href={`/transactions?q=${encodeURIComponent(d.merchant)}`}
              className="block rounded-md px-2 py-1.5 transition-colors hover:bg-foreground/[0.025]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[13px] text-foreground">
                  {d.merchant}
                </p>
                <p className="font-mono text-[12px] tabular-nums text-foreground/95">
                  {formatCurrency(d.total)}
                </p>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {meta ? <CategoryPill category={meta} size="sm" /> : null}
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/55">
                    × {d.count}
                  </span>
                </div>
                {d.sparkline.length >= 2 ? (
                  <Sparkline values={d.sparkline} />
                ) : null}
              </div>
              <div className="mt-1.5 h-[2px] overflow-hidden rounded-full bg-foreground/[0.04]">
                <div
                  className="h-full bg-primary/40"
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Tiny inline sparkline. SVG with no axes, fixed 80×20. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 80;
  const h = 20;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
    </svg>
  );
}
