import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishJob } from "@/lib/qstash";

export const dynamic = "force-dynamic";

/**
 * Daily 03:00 cron: snapshot live balances for every active Plaid item.
 *
 * Triggered by cron-job.org with `Authorization: Bearer ${CRON_SECRET}`. The
 * actual Plaid calls run in `snapshot_balances` workers (one per item) so a
 * single slow item doesn't drag the whole batch.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: items, error } = await admin
    .from("plaid_items")
    .select("id")
    .eq("status", "active");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let enqueued = 0;
  const failures: string[] = [];
  for (const item of items ?? []) {
    try {
      await publishJob({
        type: "snapshot_balances",
        idempotency_key: `snapshot-${item.id}-${new Date().toISOString().slice(0, 10)}`,
        payload: { plaid_item_id: item.id },
      });
      enqueued++;
    } catch (err) {
      failures.push(item.id);
      const message = err instanceof Error ? err.message : "publish failed";
      await admin.from("app_events").insert({
        event_type: "qstash_publish_failed",
        payload: {
          source: "cron_snapshot_balances",
          item_id: item.id,
          error: message,
        },
      });
    }
  }

  return Response.json({ ok: true, enqueued, failures: failures.length });
}
