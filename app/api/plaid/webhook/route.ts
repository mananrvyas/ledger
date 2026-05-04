import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { publishJob } from "@/lib/qstash";

export const dynamic = "force-dynamic";

/**
 * Plaid webhook receiver.
 *
 * Phase 1 implementation:
 *   - Logs every payload to plaid_webhooks (raw jsonb)
 *   - Resolves user_id and item_uuid from item_id when present
 *   - Dispatches TRANSACTIONS / SYNC_UPDATES_AVAILABLE | INITIAL_UPDATE |
 *     HISTORICAL_UPDATE | DEFAULT_UPDATE → enqueues sync_plaid_item
 *   - For ITEM error codes, updates plaid_items.status
 *
 * Signature verification: TODO. Plaid signs webhooks with a JWT in the
 * `Plaid-Verification` header keyed against a JWKS endpoint. Until that's
 * wired we accept all payloads — the impact is bounded because everything
 * just enqueues a sync with the existing item_id, and the sync job is
 * idempotent (cursor-based). Tracked as an open question in STATUS.md.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const webhookType = String(payload.webhook_type ?? "UNKNOWN");
  const webhookCode = String(payload.webhook_code ?? "UNKNOWN");
  const plaidItemId =
    typeof payload.item_id === "string" ? payload.item_id : null;

  const admin = createAdminClient();

  let itemUuid: string | null = null;
  let userId: string | null = null;

  if (plaidItemId) {
    const { data: item } = await admin
      .from("plaid_items")
      .select("id, user_id")
      .eq("plaid_item_id", plaidItemId)
      .maybeSingle();
    itemUuid = item?.id ?? null;
    userId = item?.user_id ?? null;
  }

  // Always log the raw payload — append-only audit log.
  await admin.from("plaid_webhooks").insert({
    user_id: userId,
    webhook_type: webhookType,
    webhook_code: webhookCode,
    plaid_item_id: plaidItemId,
    item_uuid: itemUuid,
    payload: payload as unknown as Json,
    processed: false,
  });

  // Bump last_webhook_at on the item.
  if (itemUuid) {
    await admin
      .from("plaid_items")
      .update({ last_webhook_at: new Date().toISOString() })
      .eq("id", itemUuid);
  }

  let dispatched = false;

  // Transactions: enqueue a sync.
  if (
    webhookType === "TRANSACTIONS" &&
    itemUuid &&
    [
      "SYNC_UPDATES_AVAILABLE",
      "INITIAL_UPDATE",
      "HISTORICAL_UPDATE",
      "DEFAULT_UPDATE",
    ].includes(webhookCode)
  ) {
    try {
      await publishJob({
        type: "sync_plaid_item",
        idempotency_key: `webhook-${plaidItemId}-${Date.now()}`,
        payload: { plaid_item_id: itemUuid },
      });
      dispatched = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "publish failed";
      await admin.from("app_events").insert({
        user_id: userId,
        event_type: "qstash_publish_failed",
        payload: { webhook_type: webhookType, webhook_code: webhookCode, error: message },
      });
    }
  }

  // Item errors: update item status so dashboard can prompt reconnect.
  if (webhookType === "ITEM" && itemUuid) {
    const errorObj =
      typeof payload.error === "object" && payload.error !== null
        ? (payload.error as { error_code?: string; error_message?: string })
        : null;
    const errorCode = errorObj?.error_code ?? null;
    const errorMessage = errorObj?.error_message ?? null;
    const newStatus =
      errorCode === "ITEM_LOGIN_REQUIRED"
        ? "requires_login"
        : webhookCode === "ERROR"
          ? "error"
          : null;

    if (newStatus) {
      await admin
        .from("plaid_items")
        .update({
          status: newStatus,
          error_code: errorCode,
          error_message: errorMessage,
        })
        .eq("id", itemUuid);
    }
  }

  return Response.json({ ok: true, dispatched });
}
