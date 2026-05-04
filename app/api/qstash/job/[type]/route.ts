import { type NextRequest } from "next/server";
import { verifyQstashSignature } from "@/lib/qstash";
import { syncPlaidItem } from "@/handlers/sync_plaid_item";
import { categorizeTransactionHandler } from "@/handlers/categorize_transaction";
import { pairRefundHandler } from "@/handlers/pair_refund";
import { sendWaNotificationHandler } from "@/handlers/send_wa_notification";
import { parseWaReplyHandler } from "@/handlers/parse_wa_reply";
import { snapshotBalancesHandler } from "@/handlers/snapshot_balances";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — sync can be slow on first run

function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.VERCEL_URL ??
    "";
  return url.startsWith("http") ? url : `https://${url}`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ type: string }> },
) {
  const { type } = await context.params;
  const signature = request.headers.get("Upstash-Signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 401 });
  }

  // QStash needs the original body bytes for signature verification.
  const rawBody = await request.text();
  const url = `${getAppUrl()}/api/qstash/job/${type}`;

  try {
    await verifyQstashSignature({ signature, body: rawBody, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return Response.json({ error: message }, { status: 401 });
  }

  let parsed: { type: string; payload: Record<string, unknown> };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    switch (type) {
      case "sync_plaid_item": {
        const result = await syncPlaidItem(
          parsed.payload as { plaid_item_id: string },
        );
        return Response.json({ ok: true, type, result });
      }
      case "categorize_transaction": {
        const result = await categorizeTransactionHandler(
          parsed.payload as { transaction_id: string; force?: boolean },
        );
        return Response.json({ ok: true, type, result });
      }
      case "pair_refund": {
        const result = await pairRefundHandler(
          parsed.payload as { transaction_id: string },
        );
        return Response.json({ ok: true, type, result });
      }
      case "send_wa_notification": {
        const result = await sendWaNotificationHandler(
          parsed.payload as {
            transaction_id: string;
            variant: "new" | "re-notify";
          },
        );
        return Response.json({ ok: true, type, result });
      }
      case "parse_wa_reply": {
        const result = await parseWaReplyHandler(
          parsed.payload as { whatsapp_message_id: string },
        );
        return Response.json({ ok: true, type, result });
      }
      case "snapshot_balances": {
        const result = await snapshotBalancesHandler(
          parsed.payload as { plaid_item_id: string },
        );
        return Response.json({ ok: true, type, result });
      }
      default:
        return Response.json(
          { error: `Unknown job type: ${type}` },
          { status: 400 },
        );
    }
  } catch (err) {
    // Throw 5xx so QStash retries with backoff.
    const message = err instanceof Error ? err.message : "Job failed";
    return Response.json({ error: message, type }, { status: 500 });
  }
}
