import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Paginated transaction list — used by the /transactions page's infinite
 * scroll to load older rows in 100-row chunks.
 *
 * Auth-gated via Supabase SSR client; RLS scopes results to the caller.
 *
 * Params:
 *   ?offset=0  — number of rows to skip (defaults to 0)
 *   ?limit=100 — page size, capped at 200
 *
 * Pagination is offset-based (not cursor-based). For a single user with
 * realtime listener invalidation, offset drift is bounded — if a new row
 * arrives mid-scroll, the worst case is one row appearing twice or being
 * skipped on the next chunk. Cursor-based pagination (date+id) is the
 * upgrade path if this becomes annoying.
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

  const { data, error, count } = await supabase
    .from("transactions")
    .select(
      "id, account_id, amount, effective_amount, date, merchant_name, name, is_pending, is_transfer, is_refund, user_category, category_source, excluded_from_stats, split_type",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rows: data ?? [], total: count ?? 0 });
}
