"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * "Recategorize" button — POSTs /api/admin/backfill-categorize. By default
 * only categorizes rows missing a category. Hold shift while clicking to
 * force-recategorize everything (overwrites manual edits — be careful).
 */
export function RecategorizeAllButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(force: boolean) {
    if (
      force &&
      !window.confirm(
        "Force-recategorize ALL transactions? This will overwrite any manual edits.",
      )
    ) {
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading(
        force ? "Re-categorizing everything…" : "Categorizing missing…",
      );
      try {
        const url = force
          ? "/api/admin/backfill-categorize?force=true"
          : "/api/admin/backfill-categorize";
        const res = await fetch(url, { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          total: number;
          enqueued: number;
          failures: number;
        };
        if (json.total === 0) {
          toast.success("Nothing to do — all transactions are categorized.", {
            id: toastId,
          });
        } else {
          toast.success(
            `Enqueued ${json.enqueued} of ${json.total}${
              json.failures ? ` · ${json.failures} failed to enqueue` : ""
            }. They'll appear over the next minute.`,
            { id: toastId, duration: 6000 },
          );
        }
        // Give QStash a moment to start processing, then refresh.
        setTimeout(() => router.refresh(), 4000);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        toast.error(`Recategorize failed: ${message}`, { id: toastId });
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={(e) => run(e.shiftKey)}
      title="Recategorize uncategorized transactions. Hold ⇧ to force-recategorize all."
      className="text-muted-foreground hover:text-foreground"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <RefreshCw className="size-3.5" strokeWidth={1.6} />
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
        recategorize
      </span>
    </Button>
  );
}
