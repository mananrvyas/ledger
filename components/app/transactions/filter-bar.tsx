"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, ChevronDown, Calendar } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { cn } from "@/lib/utils";

export type AccountOption = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
};

type Filters = {
  from: string;
  to: string;
  q: string;
  categories: string[];
  accounts: string[];
  pendingOnly: boolean;
  hideTransfers: boolean;
  hideExcluded: boolean;
  withAttachment: boolean;
};

/**
 * URL-driven filter toolbar. Each filter writes back to the same search
 * params the server-component reads on the next render. Defaults are "show
 * everything"; each filter narrows the view.
 */
export function FilterBar({
  categories,
  accounts,
}: {
  categories: CategoryMeta[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const hasAny =
    filters.from ||
    filters.to ||
    filters.q ||
    filters.categories.length > 0 ||
    filters.accounts.length > 0 ||
    filters.pendingOnly ||
    filters.hideTransfers ||
    filters.hideExcluded ||
    filters.withAttachment;

  function pushFilters(next: Partial<Filters>) {
    const merged: Filters = { ...filters, ...next };
    const params = filtersToParams(merged);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function clearAll() {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        pending && "opacity-90",
      )}
    >
      <SearchInput value={filters.q} onChange={(q) => pushFilters({ q })} />

      <DateRange
        from={filters.from}
        to={filters.to}
        onChange={(from, to) => pushFilters({ from, to })}
      />

      <CategoryPicker
        categories={categories}
        selected={filters.categories}
        onChange={(selected) => pushFilters({ categories: selected })}
      />

      <AccountPicker
        accounts={accounts}
        selected={filters.accounts}
        onChange={(selected) => pushFilters({ accounts: selected })}
      />

      <ToggleChip
        label="Pending only"
        active={filters.pendingOnly}
        onClick={() => pushFilters({ pendingOnly: !filters.pendingOnly })}
      />
      <ToggleChip
        label="Hide transfers"
        active={filters.hideTransfers}
        onClick={() => pushFilters({ hideTransfers: !filters.hideTransfers })}
      />
      <ToggleChip
        label="Hide excluded"
        active={filters.hideExcluded}
        onClick={() => pushFilters({ hideExcluded: !filters.hideExcluded })}
      />
      <ToggleChip
        label="With attachment"
        active={filters.withAttachment}
        onClick={() => pushFilters({ withAttachment: !filters.withAttachment })}
      />

      {hasAny ? (
        <button
          type="button"
          onClick={clearAll}
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 hover:text-foreground"
        >
          <X className="size-3" strokeWidth={1.6} />
          clear
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror URL-driven value into the local text. Cascading-render warning
  // doesn't apply here — `value` only changes from outside after our debounce
  // commits, so this loop never iterates.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setText(value), [value]);
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/65"
        strokeWidth={1.6}
      />
      <input
        type="search"
        placeholder="Search merchant…"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(v), 320);
        }}
        className="h-8 w-48 rounded-full border border-hairline bg-card/60 pl-7 pr-3 text-[12px] outline-none placeholder:text-muted-foreground/45 focus:border-primary/40 focus:bg-card"
      />
    </div>
  );
}

function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const label =
    from && to
      ? `${shortDate(from)} → ${shortDate(to)}`
      : from
        ? `from ${shortDate(from)}`
        : to
          ? `until ${shortDate(to)}`
          : "Any date";
  const active = !!(from || to);
  return (
    <Popover>
      <PopoverTrigger className={chipClasses(active)}>
        <Calendar className="size-3" strokeWidth={1.6} />
        {label}
        <ChevronDown className="size-3" strokeWidth={1.6} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            Date range
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">
                From
              </span>
              <input
                type="date"
                value={from}
                onChange={(e) => onChange(e.target.value, to)}
                className="h-8 w-full rounded-md border border-hairline bg-card px-2 text-[12px] tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">
                To
              </span>
              <input
                type="date"
                value={to}
                onChange={(e) => onChange(from, e.target.value)}
                className="h-8 w-full rounded-md border border-hairline bg-card px-2 text-[12px] tabular-nums"
              />
            </label>
          </div>
          {active ? (
            <button
              type="button"
              onClick={() => onChange("", "")}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 hover:text-foreground"
            >
              clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CategoryPicker({
  categories,
  selected,
  onChange,
}: {
  categories: CategoryMeta[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const label =
    selected.length === 0
      ? "All categories"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} categories`;
  return (
    <Popover>
      <PopoverTrigger className={chipClasses(selected.length > 0)}>
        {label}
        <ChevronDown className="size-3" strokeWidth={1.6} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 max-h-80 overflow-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Categories
        </p>
        <ul className="mt-2 space-y-1">
          {categories.map((c) => {
            const active = selected.includes(c.name);
            return (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      active
                        ? selected.filter((s) => s !== c.name)
                        : [...selected, c.name],
                    )
                  }
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-foreground/[0.04]",
                    active && "bg-primary/[0.08]",
                  )}
                >
                  <CategoryPill category={c} size="sm" />
                  <span
                    className={cn(
                      "size-3 rounded-sm border",
                      active
                        ? "border-primary bg-primary"
                        : "border-hairline",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 hover:text-foreground"
          >
            clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function AccountPicker({
  accounts,
  selected,
  onChange,
}: {
  accounts: AccountOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const label =
    selected.length === 0
      ? "All accounts"
      : selected.length === 1
        ? accounts.find((a) => a.id === selected[0])?.name ?? "Account"
        : `${selected.length} accounts`;
  return (
    <Popover>
      <PopoverTrigger className={chipClasses(selected.length > 0)}>
        {label}
        <ChevronDown className="size-3" strokeWidth={1.6} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-h-80 overflow-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Accounts
        </p>
        <ul className="mt-2 space-y-1">
          {accounts.map((a) => {
            const active = selected.includes(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      active
                        ? selected.filter((s) => s !== a.id)
                        : [...selected, a.id],
                    )
                  }
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-foreground/[0.04]",
                    active && "bg-primary/[0.08]",
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span className="text-foreground">{a.name}</span>
                    {a.mask ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55">
                        ···{a.mask}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "size-3 rounded-sm border",
                      active
                        ? "border-primary bg-primary"
                        : "border-hairline",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 hover:text-foreground"
          >
            clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
        active
          ? "border-primary/30 bg-primary/15 text-foreground"
          : "border-hairline bg-card/60 text-muted-foreground/75 hover:text-foreground/90",
      )}
    >
      {label}
    </button>
  );
}

function chipClasses(active: boolean): string {
  return cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
    active
      ? "border-primary/30 bg-primary/15 text-foreground"
      : "border-hairline bg-card/60 text-muted-foreground/75 hover:text-foreground/90",
  );
}

// ---------------------------------------------------------------------------
// Filter ↔ URL serialization (client-side mirror of lib/transaction-filters)
// ---------------------------------------------------------------------------

function readFilters(
  sp: ReadonlyURLSearchParams,
): Filters {
  return {
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    q: sp.get("q") ?? "",
    categories: csv(sp.get("categories")),
    accounts: csv(sp.get("accounts")),
    pendingOnly: sp.get("pending") === "1",
    hideTransfers: sp.get("hide_transfers") === "1",
    hideExcluded: sp.get("hide_excluded") === "1",
    withAttachment: sp.get("attachment") === "1",
  };
}

function filtersToParams(f: Filters): URLSearchParams {
  const out = new URLSearchParams();
  if (f.from) out.set("from", f.from);
  if (f.to) out.set("to", f.to);
  if (f.q) out.set("q", f.q);
  if (f.categories.length) out.set("categories", f.categories.join(","));
  if (f.accounts.length) out.set("accounts", f.accounts.join(","));
  if (f.pendingOnly) out.set("pending", "1");
  if (f.hideTransfers) out.set("hide_transfers", "1");
  if (f.hideExcluded) out.set("hide_excluded", "1");
  if (f.withAttachment) out.set("attachment", "1");
  return out;
}

function csv(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function shortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ReadonlyURLSearchParams = {
  get(name: string): string | null;
};
