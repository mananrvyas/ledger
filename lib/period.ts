/**
 * Period resolver for dashboard + transactions filters.
 *
 * URL-driven: every page that respects "the selected window" reads the same
 * `?period=` (or `?from&to`) params and resolves them through here. The
 * resolved object carries everything a downstream query needs — including
 * the matching prior window for apples-to-apples deltas.
 */
export type PeriodKey =
  | "this_month"
  | "last_month"
  | "3m"
  | "6m"
  | "ytd"
  | "12m"
  | "all"
  | "custom";

export type Period = {
  key: PeriodKey;
  /** Inclusive start, ISO `YYYY-MM-DD`. */
  from: string;
  /** Inclusive end, ISO `YYYY-MM-DD`. */
  to: string;
  /** Prior window for delta comparisons. Same length, immediately preceding. Null for `all`. */
  prior: { from: string; to: string } | null;
  /** Human label for headers ("This month", "Last 12 months", etc.). */
  label: string;
  /** Whether the user supplied custom from/to. */
  isCustom: boolean;
  /** Number of days the window covers (inclusive). */
  days: number;
};

const ALL_KEYS: readonly PeriodKey[] = [
  "this_month",
  "last_month",
  "3m",
  "6m",
  "ytd",
  "12m",
  "all",
  "custom",
] as const;

export const PERIOD_OPTIONS: ReadonlyArray<{ key: PeriodKey; label: string }> = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "12m", label: "12M" },
  { key: "all", label: "All" },
];

/**
 * Resolve a period from URL search params. Defaults to `this_month` when
 * unset or unrecognized. If `from` and `to` are present, they take
 * precedence and produce a `custom` period.
 */
export function resolvePeriod(
  params: { period?: string | null; from?: string | null; to?: string | null },
  now: Date = new Date(),
): Period {
  if (params.from && params.to && isIsoDay(params.from) && isIsoDay(params.to)) {
    const [from, to] =
      params.from <= params.to
        ? [params.from, params.to]
        : [params.to, params.from];
    const days = daysBetween(from, to);
    return {
      key: "custom",
      from,
      to,
      prior: shiftBackPriorWindow(from, to),
      label: `${shortDate(from)} → ${shortDate(to)}`,
      isCustom: true,
      days,
    };
  }

  const rawKey = (params.period ?? "this_month") as PeriodKey;
  const key: PeriodKey = (ALL_KEYS as readonly string[]).includes(rawKey)
    ? rawKey
    : "this_month";

  const today = isoDay(now);

  if (key === "this_month") {
    const from = isoDay(startOfMonth(now));
    const prior = priorMonthSameWindow(now);
    return {
      key,
      from,
      to: today,
      prior,
      label: "This month",
      isCustom: false,
      days: daysBetween(from, today),
    };
  }

  if (key === "last_month") {
    const start = startOfMonth(addMonths(now, -1));
    const end = endOfMonth(start);
    const from = isoDay(start);
    const to = isoDay(end);
    const priorStart = startOfMonth(addMonths(start, -1));
    const priorEnd = endOfMonth(priorStart);
    return {
      key,
      from,
      to,
      prior: { from: isoDay(priorStart), to: isoDay(priorEnd) },
      label: "Last month",
      isCustom: false,
      days: daysBetween(from, to),
    };
  }

  if (key === "3m" || key === "6m" || key === "12m") {
    const months = key === "3m" ? 3 : key === "6m" ? 6 : 12;
    const start = addDays(addMonths(now, -months), 1);
    const from = isoDay(start);
    const to = today;
    return {
      key,
      from,
      to,
      prior: shiftBackPriorWindow(from, to),
      label: key === "3m" ? "Last 3 months" : key === "6m" ? "Last 6 months" : "Last 12 months",
      isCustom: false,
      days: daysBetween(from, to),
    };
  }

  if (key === "ytd") {
    const from = isoDay(new Date(now.getFullYear(), 0, 1));
    const to = today;
    // Prior = same window last year.
    const priorFrom = `${now.getFullYear() - 1}-01-01`;
    const priorTo = isoDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
    return {
      key,
      from,
      to,
      prior: { from: priorFrom, to: priorTo },
      label: "Year to date",
      isCustom: false,
      days: daysBetween(from, to),
    };
  }

  // all
  return {
    key: "all",
    from: "1900-01-01",
    to: today,
    prior: null,
    label: "All time",
    isCustom: false,
    days: daysBetween("1900-01-01", today),
  };
}

/**
 * Build a URL-safe query string for a given period. Used by the period
 * selector when constructing links.
 */
export function periodToSearchParams(p: Period): URLSearchParams {
  const out = new URLSearchParams();
  if (p.isCustom) {
    out.set("from", p.from);
    out.set("to", p.to);
  } else if (p.key !== "this_month") {
    out.set("period", p.key);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Date helpers — ISO `YYYY-MM-DD` everywhere; no Date timezone surprises.
// ---------------------------------------------------------------------------

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function daysBetween(from: string, to: string): number {
  const f = new Date(from + "T00:00:00").getTime();
  const t = new Date(to + "T00:00:00").getTime();
  return Math.max(1, Math.round((t - f) / 86_400_000) + 1);
}

export function isIsoDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function shortDate(s: string): string {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Same-day-of-month window in the prior month, clamped to the prior month's end. */
function priorMonthSameWindow(now: Date): { from: string; to: string } {
  const startThis = startOfMonth(now);
  const startPrior = startOfMonth(addMonths(startThis, -1));
  const day = now.getDate();
  // Clamp to last day of prior month if overflowing (e.g. Mar 31 → Feb 28).
  const candidate = new Date(startPrior.getFullYear(), startPrior.getMonth(), day);
  const clamped =
    candidate.getMonth() !== startPrior.getMonth()
      ? endOfMonth(startPrior)
      : candidate;
  return { from: isoDay(startPrior), to: isoDay(clamped) };
}

/** For an arbitrary [from, to], the prior window is the same length immediately before. */
function shiftBackPriorWindow(
  from: string,
  to: string,
): { from: string; to: string } {
  const days = daysBetween(from, to);
  const fromDate = new Date(from + "T00:00:00");
  const priorTo = addDays(fromDate, -1);
  const priorFrom = addDays(priorTo, -(days - 1));
  return { from: isoDay(priorFrom), to: isoDay(priorTo) };
}
