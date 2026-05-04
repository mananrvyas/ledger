"use client";

import { useEffect, useRef } from "react";

/**
 * Fire-and-forget trigger that POSTs `/api/refresh` once when the dashboard
 * first renders. The endpoint kicks off a Plaid sync for any item with
 * `last_synced_at` older than 5 min and is auth-gated.
 *
 * Result-of-sync arrives via the RealtimeListener (subscribed to
 * `transactions` + `accounts` postgres_changes), which calls `router.refresh()`
 * so the SSR page re-runs with fresh data. So the user sees:
 *   - mount → stale data renders immediately (no spinner, no flash)
 *   - sync runs in the background (~1-3s)
 *   - realtime listener fires → page re-renders with live numbers
 *
 * The `useRef` guard prevents StrictMode's double-mount in dev from firing
 * the request twice.
 */
export function RefreshOnMount() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    fetch("/api/refresh", { method: "POST" }).catch(() => {
      // Silent — the page already shows whatever was in the DB; the next
      // hourly sync-fallback cron will pick up anything we missed.
    });
  }, []);

  return null;
}
