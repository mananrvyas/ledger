import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishJob } from "@/lib/qstash";

export const dynamic = "force-dynamic";

/**
 * On-demand refresh — used by the dashboard to nudge a sync when the user
 * opens the page, so balances + transactions look as live as possible.
 *
 * Auth-gated (Supabase session). Per-user throttle via the `last_synced_at`
 * field on `plaid_items`: an item that synced within the last 5 minutes is
 * skipped. Calls `transactionsSync` indirectly (via QStash → handler), which
 * is bundled in the per-item Transactions subscription — so this is free
 * even at high tap rates.
 *
 * Returns counts: `enqueued` (items we kicked off a sync for) and `skipped`
 * (items still fresh enough that we left them alone).
 */

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  const { data: items, error } = await admin
    .from("plaid_items")
    .select("id, last_synced_at")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const stale = (items ?? []).filter(
    (it) => !it.last_synced_at || it.last_synced_at < cutoff,
  );
  const fresh = (items ?? []).length - stale.length;

  let enqueued = 0;
  for (const item of stale) {
    try {
      await publishJob({
        type: "sync_plaid_item",
        idempotency_key: `refresh-${item.id}-${Math.floor(Date.now() / 60000)}`,
        payload: { plaid_item_id: item.id },
      });
      enqueued++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "publish failed";
      await admin.from("app_events").insert({
        user_id: user.id,
        event_type: "qstash_publish_failed",
        payload: { source: "refresh", item_id: item.id, error: message },
      });
    }
  }

  return Response.json({ ok: true, enqueued, skipped: fresh });
}
