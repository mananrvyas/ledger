/** Currency / amount / date formatters. Centralized so amounts always render
 *  with tabular numerals and consistent locale. */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return usdFormatter.format(amount);
}

export function formatCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return compactFormatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const timeAgoFormatter = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
});

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return dateFormatter.format(new Date(d));
}

/**
 * Compact ledger date. Year is rendered ONLY when it differs from the
 * current one — current-year transactions stay terse ("Apr 23"), older
 * ones get an apostrophe-year ("Apr 23 '25"). Plaid backfills 24 months
 * by default, so this matters anywhere we paginate past Jan 1.
 */
export function formatShortDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  const monthDay = shortDateFormatter.format(date);
  const year = date.getFullYear();
  if (year === new Date().getFullYear()) return monthDay;
  return `${monthDay} '${String(year).slice(-2)}`;
}

/**
 * "2m ago", "3h ago", "5d ago", "—". Returns "just now" within last minute.
 */
export function formatRelative(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return timeAgoFormatter.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return timeAgoFormatter.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return timeAgoFormatter.format(diffDay, "day");
}

/** Title-case a Plaid account type / subtype string. */
export function prettyType(s: string | null | undefined): string {
  if (!s) return "—";
  return s
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
