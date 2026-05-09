import Link from "next/link";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { formatCurrency, formatShortDate } from "@/lib/format";

export type LargestTransactionDatum = {
  id: string;
  date: string;
  merchant: string;
  category: string | null;
  amount: number;
};

/**
 * Top N largest single transactions in the period. Useful for catching
 * outliers (one-off big purchases skewing the donut).
 */
export function LargestTransactions({
  data,
  categoryByName,
}: {
  data: LargestTransactionDatum[];
  categoryByName: Map<string, CategoryMeta>;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground/70">
        No transactions in this period.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hairline">
      {data.map((d) => {
        const meta =
          d.category && categoryByName.get(d.category)
            ? categoryByName.get(d.category)!
            : d.category
              ? { name: d.category, color: null, icon: null }
              : null;
        return (
          <li key={d.id}>
            <Link
              href={`/transactions/${d.id}`}
              className="grid grid-cols-[64px_1fr_auto] items-baseline gap-3 px-2 py-2.5 transition-colors hover:bg-foreground/[0.025]"
            >
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatShortDate(d.date)}
              </p>
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-[13px] text-foreground">
                  {d.merchant}
                </p>
                {meta ? <CategoryPill category={meta} size="sm" /> : null}
              </div>
              <p className="font-mono text-[13px] tabular-nums text-foreground/95">
                {formatCurrency(d.amount)}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
