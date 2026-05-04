"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { cn } from "@/lib/utils";

/**
 * Inline category picker. Click the pill → popover with searchable list.
 * Selecting a category PATCHes the transaction immediately and refreshes
 * server data via router.refresh().
 *
 * The picker only changes the displayed category. Side effect on the server:
 * /api/transactions/[id] PATCH also upserts a learned merchant→category rule
 * so future transactions from the same merchant skip the LLM tier.
 */
export function CategoryPicker({
  transactionId,
  current,
  options,
}: {
  transactionId: string;
  current: CategoryMeta | null;
  options: CategoryMeta[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(name: string) {
    setOpen(false);
    if (name === current?.name) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/transactions/${transactionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_category: name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        toast.success(`Categorized as ${name}`);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Update failed";
        toast.error(message);
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={pending}
        aria-label="Change category"
        className={cn(
          "group inline-flex items-center gap-1 rounded-md outline-none transition-opacity",
          "hover:opacity-85 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50",
          pending && "opacity-50",
        )}
      >
        <CategoryPill category={current} size="md" />
        {pending ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : (
          <ChevronsUpDown className="size-3 text-muted-foreground/40 group-hover:text-muted-foreground" />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((cat) => (
                <CommandItem
                  key={cat.name}
                  value={cat.name}
                  onSelect={() => apply(cat.name)}
                  className="flex items-center gap-2"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: cat.color ?? "#71717a" }}
                  />
                  <span className="flex-1">{cat.name}</span>
                  {current?.name === cat.name ? (
                    <Check className="size-3.5 text-primary" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
