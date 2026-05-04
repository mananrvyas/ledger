import { type NextRequest } from "next/server";
import { verifyQstashSignature } from "@/lib/qstash";
import { syncPlaidItem } from "@/handlers/sync_plaid_item";

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
