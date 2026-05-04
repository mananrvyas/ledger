import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY in:
 *   - webhook handlers (Plaid, Twilio) which act on a user's behalf without
 *     an auth context
 *   - QStash workers (background jobs)
 *   - cron handlers
 *
 * Never import this in a Client Component or Server Component that runs in the
 * browser — the service-role key would leak. The check below is a runtime guard.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient may only be called on the server");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
