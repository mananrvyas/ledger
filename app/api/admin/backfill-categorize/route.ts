import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishJob } from "@/lib/qstash";

export const dynamic = "force-dynamic";

/**
 * One-shot: enqueue categorize_transaction for every uncategorized transaction
 * the authenticated user owns. Useful after schema changes (e.g. enabling
 * categorization in Phase 2) and as a manual recovery hatch in the dashboard.
 *
 * Auth: Supabase session — caller must be signed in. Returns count enqueued.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";

  const admin = createAdminClient();
  const query = admin
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(2000);

  if (!force) {
    query.is("category_source", null);
  }

  const { data: rows, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let enqueued = 0;
  let failures = 0;
  for (const row of rows ?? []) {
    try {
      await publishJob({
        type: "categorize_transaction",
        idempotency_key: `backfill-${row.id}-${force ? "force" : "missing"}`,
        payload: { transaction_id: row.id, force },
      });
      enqueued++;
    } catch {
      failures++;
    }
  }

  return Response.json({ ok: true, total: rows?.length ?? 0, enqueued, failures, force });
}
