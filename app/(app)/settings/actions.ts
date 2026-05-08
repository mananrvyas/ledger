"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Profile update — writes to `profiles` row owned by the current user.
 * Phone is normalized to E.164 (`+15551234567`) regardless of how the user
 * typed it. Empty string clears the phone (which silences their WA pipeline
 * without breaking it — they can re-enter to resume).
 */
export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateProfile(formData: FormData): Promise<UpdateProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const rawPhone = String(formData.get("whatsapp_number") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();

  let normalizedPhone: string | null = null;
  if (rawPhone.length > 0) {
    // Strip everything except digits and a leading +. Then accept either
    // already-+E164 or default-prefix US (10 digits → +1XXXXXXXXXX).
    const stripped = rawPhone.replace(/[^\d+]/g, "");
    if (stripped.startsWith("+") && stripped.length >= 8) {
      normalizedPhone = stripped;
    } else if (/^\d{10}$/.test(stripped)) {
      normalizedPhone = `+1${stripped}`;
    } else {
      return {
        ok: false,
        error: "Phone must be in E.164 format (e.g. +15551234567).",
      };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      whatsapp_number: normalizedPhone,
      display_name: displayName.length > 0 ? displayName : null,
    })
    .eq("user_id", user.id);

  if (error) {
    // Unique-constraint violation (another user already has this number) is
    // a 23505 — surface a friendly error.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That WhatsApp number is already linked to another account.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}
