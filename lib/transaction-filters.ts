import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Server-side counterpart to <FilterBar/>'s URL serialization. Page server
 * component + API route both call into here so the wire format stays in
 * one place.
 *
 * Default behavior is "show everything." Each flag NARROWS the view.
 */
export type TxFilters = {
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

export function readTxFiltersFromSearchParams(
  sp: URLSearchParams,
): TxFilters {
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

/** Determines whether ANY filter is active. Used to render the "clear" link. */
export function hasAnyTxFilter(f: TxFilters): boolean {
  return (
    !!f.from ||
    !!f.to ||
    !!f.q ||
    f.categories.length > 0 ||
    f.accounts.length > 0 ||
    f.pendingOnly ||
    f.hideTransfers ||
    f.hideExcluded ||
    f.withAttachment
  );
}

export function filterSignature(f: TxFilters): string {
  return JSON.stringify({
    from: f.from,
    to: f.to,
    q: f.q,
    categories: f.categories.slice().sort(),
    accounts: f.accounts.slice().sort(),
    pendingOnly: f.pendingOnly,
    hideTransfers: f.hideTransfers,
    hideExcluded: f.hideExcluded,
    withAttachment: f.withAttachment,
  });
}

/**
 * Pre-fetch transaction_ids that have at least one attachment row. The main
 * transactions query then `.in("id", ids)` to filter. Two queries instead
 * of an embedded join, but keeps the count() math correct.
 */
export async function fetchAttachmentTxIds(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data } = await supabase
    .from("transaction_attachments")
    .select("transaction_id");
  return Array.from(
    new Set(
      (data ?? [])
        .map((r) => r.transaction_id)
        .filter((v): v is string => v != null),
    ),
  );
}

/**
 * IDs of the user's non-archived accounts. The transaction list surfaces
 * (`/transactions` page + `/api/transactions`) constrain to these so that
 * rows belonging to a disconnected/archived account (e.g. an old item left
 * behind after a re-link) don't surface as ghost duplicates. RLS already
 * scopes to the user; this just drops archived accounts.
 *
 * Returns a sentinel non-matching UUID when the user has no active accounts,
 * so the caller's `.in("account_id", ids)` cleanly yields zero rows rather
 * than an empty-array filter that some clients treat as a no-op.
 */
export async function fetchActiveAccountIds(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data } = await supabase
    .from("accounts")
    .select("id")
    .eq("is_archived", false);
  const ids = (data ?? []).map((r) => r.id);
  return ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"];
}

function csv(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
