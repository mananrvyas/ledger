import { type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Top-row dashboard stat (Spent this month, Net worth). Big number + delta
 * pill. The delta direction (up/down) is interpreted by the consumer — for
 * spending, more is bad (red); for net worth, more is good (green). The
 * `deltaTone` prop lets the caller decide.
 */
export function StatCard({
  kicker,
  value,
  delta,
  deltaTone = "neutral",
  footnote,
  children,
}: {
  kicker: string;
  value: string;
  delta?: { label: string; direction: "up" | "down" | "flat" } | null;
  /** "good" → green-ish, "bad" → muted red, "neutral" → muted */
  deltaTone?: "good" | "bad" | "neutral";
  footnote?: string;
  /** Optional inline content (e.g. tiny sparkline). */
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
        {kicker}
      </p>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="font-display text-3xl font-normal italic leading-[1] text-foreground tabular-nums">
          {value}
        </p>
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums",
              deltaTone === "good" && "text-emerald-300/85",
              deltaTone === "bad" && "text-rose-300/80",
              deltaTone === "neutral" && "text-muted-foreground/70",
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight className="size-3" strokeWidth={1.6} />
            ) : delta.direction === "down" ? (
              <ArrowDownRight className="size-3" strokeWidth={1.6} />
            ) : null}
            {delta.label}
          </span>
        ) : null}
      </div>
      {footnote ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
          {footnote}
        </p>
      ) : null}
      {children}
    </div>
  );
}
