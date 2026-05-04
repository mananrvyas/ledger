import { Client, Receiver } from "@upstash/qstash";

/**
 * QStash publisher and verifier wrappers. Background jobs go through QStash so
 * webhooks can ack fast, and we get exponential-backoff retries for free.
 *
 * Job naming convention: { type, idempotencyKey, payload }. Workers live at
 * /api/qstash/job/[type]/route.ts.
 */

let client: Client | null = null;
let receiver: Receiver | null = null;

export type JobType =
  | "sync_plaid_item"
  | "categorize_transaction"
  | "pair_refund"
  | "send_wa_notification"
  | "parse_wa_reply"
  | "snapshot_balances"
  | "notify_item_error";

export type JobBody<T extends Record<string, unknown> = Record<string, unknown>> = {
  type: JobType;
  idempotency_key: string;
  payload: T;
};

function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.VERCEL_URL ??
    "";
  if (!url) {
    throw new Error("APP_URL / NEXT_PUBLIC_APP_URL not set");
  }
  return url.startsWith("http") ? url : `https://${url}`;
}

function getClient(): Client {
  if (client) return client;
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN not set");
  client = new Client({ token });
  return client;
}

function getReceiver(): Receiver {
  if (receiver) return receiver;
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) {
    throw new Error("QSTASH signing keys not set");
  }
  receiver = new Receiver({
    currentSigningKey: current,
    nextSigningKey: next,
  });
  return receiver;
}

/**
 * Publish a job to QStash. The worker URL is derived from APP_URL +
 * /api/qstash/job/{type}. QStash retries failed (non-2xx) responses with
 * exponential backoff up to `retries` (default 3).
 */
export async function publishJob<T extends Record<string, unknown>>(
  job: JobBody<T>,
  options: { retries?: number; delaySeconds?: number } = {},
): Promise<{ messageId: string }> {
  const c = getClient();
  const url = `${getAppUrl()}/api/qstash/job/${job.type}`;

  const result = await c.publishJSON({
    url,
    body: job,
    retries: options.retries ?? 3,
    delay: options.delaySeconds,
  });

  return { messageId: result.messageId };
}

/**
 * Verify the QStash signature on an incoming worker request. Throws if invalid.
 * Call this at the top of every /api/qstash/job/*.
 */
export async function verifyQstashSignature(params: {
  signature: string;
  body: string;
  url: string;
}): Promise<void> {
  const r = getReceiver();
  const isValid = await r.verify({
    signature: params.signature,
    body: params.body,
    url: params.url,
  });
  if (!isValid) {
    throw new Error("Invalid QStash signature");
  }
}
