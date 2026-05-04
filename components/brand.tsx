import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizes: Record<Size, { glyph: string; word: string; gap: string }> = {
  sm: {
    glyph: "text-xl",
    word: "text-[9px] tracking-[0.22em]",
    gap: "gap-1.5",
  },
  md: {
    glyph: "text-2xl",
    word: "text-[10px] tracking-[0.24em]",
    gap: "gap-2",
  },
  lg: {
    glyph: "text-4xl",
    word: "text-[11px] tracking-[0.26em]",
    gap: "gap-2.5",
  },
};

/**
 * Florin (ƒ) + small uppercase wordmark. The serif glyph is the memorable mark;
 * the wordmark anchors it. Used in the header and auth pages.
 */
export function Brand({
  size = "md",
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const s = sizes[size];
  return (
    <div
      className={cn(
        "inline-flex items-baseline font-display",
        s.gap,
        className,
      )}
    >
      <span
        className={cn(
          "italic font-medium leading-none text-primary translate-y-[2px]",
          s.glyph,
        )}
        aria-hidden
      >
        ƒ
      </span>
      <span
        className={cn(
          "font-mono uppercase font-medium text-muted-foreground",
          s.word,
        )}
      >
        finance
      </span>
    </div>
  );
}
