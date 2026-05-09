"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the transaction detail page. Each one is RLS-scoped
 * via the SSR client (auth.uid() must own the row). Stamps `last_user_edit_at`
 * on every write so the WA reply matcher knows to leave it alone.
 */

export async function updateNotes(
  transactionId: string,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("transactions")
    .update({
      notes: notes.trim() === "" ? null : notes,
      last_user_edit_at: new Date().toISOString(),
    })
    .eq("id", transactionId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/transactions/${transactionId}`);
  return { ok: true };
}

export async function setExcluded(
  transactionId: string,
  excluded: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("transactions")
    .update({
      excluded_from_stats: excluded,
      last_user_edit_at: new Date().toISOString(),
    })
    .eq("id", transactionId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/transactions/${transactionId}`);
  return { ok: true };
}

export type SplitType = "none" | "percent" | "fixed" | "ratio";

export async function updateSplit(
  transactionId: string,
  splitType: SplitType,
  splitValue: number | null,
  rawInput: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  if (!["none", "percent", "fixed", "ratio"].includes(splitType)) {
    return { ok: false, error: "invalid split_type" };
  }

  if (splitType !== "none") {
    if (splitValue == null || !Number.isFinite(splitValue) || splitValue <= 0) {
      return { ok: false, error: "split_value must be positive" };
    }
    if (splitType === "percent" && splitValue > 100) {
      return { ok: false, error: "percent must be ≤ 100" };
    }
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      split_type: splitType,
      split_value: splitType === "none" ? null : splitValue,
      split_raw_input: splitType === "none" ? null : rawInput,
      last_user_edit_at: new Date().toISOString(),
    })
    .eq("id", transactionId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/transactions/${transactionId}`);
  return { ok: true };
}
