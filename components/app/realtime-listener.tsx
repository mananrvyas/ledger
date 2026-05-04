"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime on the user's `transactions` and `accounts`
 * tables. On any change, calls `router.refresh()` so the closest server-rendered
 * page (dashboard, /transactions, /accounts) re-fetches its data without a
 * full page reload.
 *
 * One subscription per table; both share a debounced refresh to coalesce
 * bursts (e.g. a sync that adds 30 rows shouldn't trigger 30 refreshes).
 *
 * Mounted in `(app)/layout.tsx` so it follows the user across pages without
 * remounting between routes.
 */
export function RealtimeListener({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    }

    const channel = supabase
      .channel(`app-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "accounts",
          filter: `user_id=eq.${userId}`,
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
