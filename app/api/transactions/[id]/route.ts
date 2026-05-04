import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesUpdate } from "@/lib/database.types";
import { upsertCategoryRule } from "@/lib/categorize";

export const dynamic = "force-dynamic";

type PatchBody = {
  user_category?: string;
  notes?: string | null;
  excluded_from_stats?: boolean;
  split_type?: "none" | "percent" | "fixed" | "ratio";
  split_value?: number | null;
  split_raw_input?: string | null;
  split_note?: string | null;
};

/**
 * PATCH /api/transactions/[id]
 *
 * Edit a single transaction (auth-gated, RLS-bound).
 * Side effect: when user_category changes, upsert a learned rule keyed on the
 * normalized merchant_name so the next sync of the same merchant skips the
 * LLM tier.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate split_type if present.
  if (
    body.split_type &&
    !["none", "percent", "fixed", "ratio"].includes(body.split_type)
  ) {
    return Response.json({ error: "invalid split_type" }, { status: 400 });
  }

  // Load current row first — RLS-checked through the user-bound client.
  const { data: existing, error: loadErr } = await supabase
    .from("transactions")
    .select("id, merchant_name, name, user_category, amount")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const update: TablesUpdate<"transactions"> = {
    last_user_edit_at: new Date().toISOString(),
  };
  if (body.user_category !== undefined) {
    update.user_category = body.user_category;
    update.category_source = "manual";
  }
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.excluded_from_stats !== undefined) {
    update.excluded_from_stats = body.excluded_from_stats;
  }
  if (body.split_type !== undefined) update.split_type = body.split_type;
  if (body.split_value !== undefined) update.split_value = body.split_value;
  if (body.split_raw_input !== undefined) {
    update.split_raw_input = body.split_raw_input;
  }
  if (body.split_note !== undefined) update.split_note = body.split_note;

  const { data: updated, error: updateErr } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", id)
    .select("id, user_category, notes, excluded_from_stats, split_type, split_value, split_raw_input, split_note, effective_amount")
    .maybeSingle();

  if (updateErr || !updated) {
    return Response.json(
      { error: updateErr?.message ?? "update_failed" },
      { status: 500 },
    );
  }

  // Persist a learned rule when the user changed the category. Use the admin
  // client so the rule lives even if RLS chokes on edge cases (it shouldn't,
  // but the rule is audit-y and worth being defensive about).
  if (
    body.user_category !== undefined &&
    body.user_category !== existing.user_category
  ) {
    await upsertCategoryRule({
      admin: createAdminClient(),
      userId: user.id,
      merchantName: existing.merchant_name ?? existing.name,
      categoryName: body.user_category,
    });
  }

  return Response.json({ ok: true, transaction: updated });
}
