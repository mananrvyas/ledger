import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishJob } from "@/lib/qstash";

export const dynamic = "force-dynamic";

/**
 * Hourly fallback sync.
 *
 * Finds active Plaid items where last_synced_at is older than 90 minutes (or
 * NULL), and enqueues a sync for each. Catches missed webhooks.
 *
 * Triggered by cron-job.org with `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 90 * 60 * 1000).toISOString();

  const { data: items, error } = await admin
    .from("plaid_items")
    .select("id")
    .eq("status", "active")
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let enqueued = 0;
  const failures: string[] = [];

  for (const item of items ?? []) {
    try {
      await publishJob({
        type: "sync_plaid_item",
        idempotency_key: `cron-${item.id}-${Date.now()}`,
        payload: { plaid_item_id: item.id },
      });
      enqueued++;
    } catch (err) {
      failures.push(item.id);
      const message = err instanceof Error ? err.message : "publish failed";
      await admin.from("app_events").insert({
        event_type: "qstash_publish_failed",
        payload: { source: "cron_sync_fallback", item_id: item.id, error: message },
      });
    }
  }

  return Response.json({
    ok: true,
    enqueued,
    failures: failures.length,
    cutoff,
  });
}
