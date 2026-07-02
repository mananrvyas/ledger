import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchActiveAccountIds,
  fetchAttachmentTxIds,
  readTxFiltersFromSearchParams,
} from "@/lib/transaction-filters";

export const dynamic = "force-dynamic";

const TX_SELECT =
  "id, account_id, amount, effective_amount, date, merchant_name, name, is_pending, is_transfer, is_refund, user_category, category_source, excluded_from_stats, split_type";

/**
 * Paginated, filtered transaction list. Used by /transactions infinite-scroll
 * to load older rows. Filters mirror the URL params written by <FilterBar/>.
 *
 * Pagination is offset-based; for one user with realtime invalidation, drift
 * between pages is bounded.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
  );
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100),
  );
  const filters = readTxFiltersFromSearchParams(url.searchParams);

  // Pre-fetch attachment-bearing transaction_ids if the toggle is on.
  let attachmentIds: string[] | null = null;
  if (filters.withAttachment) {
    attachmentIds = await fetchAttachmentTxIds(supabase);
    if (attachmentIds.length === 0) {
      return Response.json({ rows: [], total: 0 });
    }
  }

  // Constrain to active accounts so rows from an archived/disconnected item
  // (e.g. an old connection left behind after a re-link) don't reappear.
  const activeAccountIds = await fetchActiveAccountIds(supabase);

  let query = supabase
    .from("transactions")
    .select(TX_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .in("account_id", activeAccountIds);

  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);
  if (filters.q) {
    const escaped = filters.q.replace(/[%,]/g, "");
    query = query.or(
      `merchant_name.ilike.%${escaped}%,name.ilike.%${escaped}%`,
    );
  }
  if (filters.categories.length > 0) {
    query = query.in("user_category", filters.categories);
  }
  if (filters.accounts.length > 0) {
    query = query.in("account_id", filters.accounts);
  }
  if (filters.pendingOnly) query = query.eq("is_pending", true);
  if (filters.hideTransfers) query = query.eq("is_transfer", false);
  if (filters.hideExcluded) query = query.eq("excluded_from_stats", false);
  if (attachmentIds) query = query.in("id", attachmentIds);

  query = query
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rows: data ?? [], total: count ?? 0 });
}
