import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publishJob } from "@/lib/qstash";

export const dynamic = "force-dynamic";

/**
 * Auth-gated admin endpoint for test-firing a single WhatsApp notification.
 * Useful for verifying Twilio credentials + your sandbox pairing without
 * flooding your phone with the full backfill set.
 *
 * Body: { transaction_id?: string }
 *   - if omitted, picks the user's most recent non-transfer, non-deleted tx.
 *
 * Always uses variant='new' (the standard notification) and bypasses the
 * `last_notified_at` skip in the worker by passing a unique idempotency key.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { transaction_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  let transactionId = body.transaction_id ?? null;
  if (!transactionId) {
    const { data: row } = await supabase
      .from("transactions")
      .select("id")
      .is("deleted_at", null)
      .eq("is_transfer", false)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    transactionId = row?.id ?? null;
  }

  if (!transactionId) {
    return Response.json(
      { error: "no_transaction_to_test_with" },
      { status: 400 },
    );
  }

  // Verify ownership via RLS-bound select before enqueueing.
  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .select("id, merchant_name, name, amount, last_notified_at")
    .eq("id", transactionId)
    .maybeSingle();

  if (txErr || !tx) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Temporarily clear last_notified_at so the worker doesn't skip
  // (the 'new' variant skips already-notified rows by design).
  await supabase
    .from("transactions")
    .update({ last_notified_at: null, notified_amount: null })
    .eq("id", tx.id);

  await publishJob({
    type: "send_wa_notification",
    idempotency_key: `wa-test-${tx.id}-${Date.now()}`,
    payload: { transaction_id: tx.id, variant: "new" },
  });

  return Response.json({
    ok: true,
    transaction_id: tx.id,
    merchant: tx.merchant_name ?? tx.name,
    amount: tx.amount,
  });
}
