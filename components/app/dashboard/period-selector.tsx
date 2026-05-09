"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { type PeriodKey, PERIOD_OPTIONS } from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * URL-driven period pill group. Mounted in the dashboard header. Pushes the
 * new key into the URL with `router.replace` (no history entry per click);
 * preserves any other params the page may be using.
 */
export function PeriodSelector({
  current,
  isCustom,
}: {
  current: PeriodKey;
  /** True when the URL has explicit ?from&to — show a "Custom" pill, disabled. */
  isCustom: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function selectKey(key: PeriodKey) {
    const params = new URLSearchParams(searchParams.toString());
    // Selecting a preset clears any explicit from/to.
    params.delete("from");
    params.delete("to");
    if (key === "this_month") {
      params.delete("period");
    } else {
      params.set("period", key);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div
      role="tablist"
      aria-label="Date range"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-hairline bg-card/60 p-0.5 backdrop-blur-sm",
        pending && "opacity-80",
      )}
    >
      {PERIOD_OPTIONS.map((opt) => {
        const active = !isCustom && opt.key === current;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => selectKey(opt.key)}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
              active
                ? "bg-primary/15 text-foreground ring-1 ring-primary/30"
                : "text-muted-foreground/75 hover:text-foreground/90",
            )}
          >
            {opt.label}
          </button>
        );
      })}
      {isCustom ? (
        <span className="ml-1 rounded-full bg-primary/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground ring-1 ring-primary/30">
          Custom
        </span>
      ) : null}
    </div>
  );
}
