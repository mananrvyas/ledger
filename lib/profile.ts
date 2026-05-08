import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Profile lookups for the multi-user pipeline. Replaces the single-user
 * `USER_WHATSAPP_TO` env var with per-user phone numbers stored in the
 * `profiles` table (created in migration 0010).
 *
 * All lookups go through service-role since they're called from background
 * workers and webhook handlers that don't carry an auth context.
 */

export type ProfileRow = {
  user_id: string;
  whatsapp_number: string | null;
  display_name: string | null;
};

/**
 * Resolve a user's WhatsApp phone number for outbound sends. Returns null
 * if the user hasn't set one yet — caller should treat this as "skip".
 */
export async function getUserWhatsAppNumber(
  userId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("whatsapp_number")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.whatsapp_number ?? null;
}

/**
 * Resolve a user_id from an inbound Twilio `From` field. Twilio sends
 * `whatsapp:+15551234567`; we strip the prefix and look up by E.164.
 *
 * Returns null on no match — webhook caller should drop the message.
 */
export async function findUserByWhatsAppNumber(
  fromField: string,
): Promise<string | null> {
  const phone = fromField.startsWith("whatsapp:")
    ? fromField.slice("whatsapp:".length)
    : fromField;
  if (!phone) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("user_id")
    .eq("whatsapp_number", phone)
    .maybeSingle();
  return data?.user_id ?? null;
}
