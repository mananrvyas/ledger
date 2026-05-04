import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  plaid: "P",
  rule: "R",
  ai: "AI",
  manual: "M",
};

const TONE: Record<string, string> = {
  plaid: "text-emerald-300/80",
  rule: "text-sky-300/80",
  ai: "text-primary/80",
  manual: "text-foreground/70",
};

const TITLE: Record<string, string> = {
  plaid: "Plaid (high-confidence)",
  rule: "Learned merchant rule",
  ai: "Claude Haiku",
  manual: "Manually set",
};

/**
 * Tiny single-letter (or "AI") indicator showing which tier of the
 * categorization waterfall produced this row's category. Designed to sit
 * inline next to the category pill in the transactions table.
 */
export function SourceTag({
  source,
  className,
}: {
  source: string | null;
  className?: string;
}) {
  if (!source) {
    return (
      <span
        className={cn(
          "font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/40",
          className,
        )}
        title="Not yet categorized"
      >
        —
      </span>
    );
  }
  const label = LABEL[source] ?? source.slice(0, 2).toUpperCase();
  const tone = TONE[source] ?? "text-muted-foreground/70";
  const title = TITLE[source] ?? source;
  return (
    <span
      className={cn(
        "font-mono text-[9px] uppercase tracking-[0.18em] tabular-nums",
        tone,
        className,
      )}
      title={title}
    >
      {label}
    </span>
  );
}
