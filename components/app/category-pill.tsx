import {
  ArrowDownCircle,
  ArrowLeftRight,
  Bolt,
  Bus,
  Circle,
  Coffee,
  Dumbbell,
  Film,
  Gift,
  HeartPulse,
  Home,
  Plane,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Undo2,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  coffee: Coffee,
  bus: Bus,
  plane: Plane,
  home: Home,
  bolt: Bolt,
  repeat: Repeat,
  "shopping-bag": ShoppingBag,
  "heart-pulse": HeartPulse,
  film: Film,
  sparkles: Sparkles,
  dumbbell: Dumbbell,
  gift: Gift,
  receipt: Receipt,
  "arrow-down-circle": ArrowDownCircle,
  "arrow-left-right": ArrowLeftRight,
  "undo-2": Undo2,
  circle: Circle,
} as const;

export type CategoryMeta = {
  name: string;
  color: string | null;
  icon: string | null;
};

type Size = "sm" | "md";

const SIZES: Record<Size, { container: string; icon: string; text: string }> = {
  sm: {
    container: "h-5 px-1.5 gap-1 rounded-md text-[11px]",
    icon: "size-3",
    text: "tracking-tight",
  },
  md: {
    container: "h-6 px-2 gap-1.5 rounded-md text-[12px]",
    icon: "size-3.5",
    text: "tracking-tight",
  },
};

/**
 * Compact category pill — colored dot + name. Used in transaction rows.
 *
 * Color comes from the seeded `categories.color` value. We don't tint the
 * background heavily — a small dot keeps the table readable. Icon is rendered
 * separately when needed (in pickers, headers, etc.).
 */
export function CategoryPill({
  category,
  size = "md",
  showIcon = false,
  className,
}: {
  category: CategoryMeta | null;
  size?: Size;
  showIcon?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  if (!category) {
    return (
      <span
        className={cn(
          "inline-flex items-center border border-dashed border-border text-muted-foreground/70",
          s.container,
          s.text,
          className,
        )}
      >
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        Uncategorized
      </span>
    );
  }

  const color = category.color ?? "#71717a";
  const Icon = category.icon
    ? (ICONS as Record<string, typeof Circle>)[category.icon]
    : null;

  return (
    <span
      className={cn(
        "inline-flex items-center border border-border bg-foreground/[0.04] text-foreground/85",
        s.container,
        s.text,
        className,
      )}
      style={{ borderColor: `${color}40` }}
    >
      {Icon && showIcon ? (
        <Icon className={s.icon} strokeWidth={1.6} style={{ color }} />
      ) : (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="truncate">{category.name}</span>
    </span>
  );
}
