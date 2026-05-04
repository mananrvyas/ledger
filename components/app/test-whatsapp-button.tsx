"use client";

import { useTransition } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Test-fire a single WhatsApp notification for a transaction. Used to verify
 * Twilio + sandbox pairing without flooding your phone with the full backfill.
 *
 * Two visual variants:
 *   - default (header) — labeled "test wa" ghost button. With no `transactionId`,
 *     the API picks the user's most recent non-transfer tx.
 *   - compact (row)    — icon-only ghost button sized for inline use in a row.
 *     Always passes the row's `transactionId` so any tx is testable in one click.
 */
export function TestWhatsAppButton({
  transactionId,
  compact = false,
}: {
  transactionId?: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function run(e?: React.MouseEvent) {
    // In compact mode the button sits inside a transaction row; without
    // stopPropagation a click could bubble to a future row-level handler.
    e?.stopPropagation();
    startTransition(async () => {
      const toastId = toast.loading("Sending one test message…");
      try {
        const res = await fetch("/api/admin/test-wa-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            transactionId ? { transaction_id: transactionId } : {},
          ),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          merchant: string | null;
          amount: number;
        };
        toast.success(
          `Queued: ${json.merchant ?? "Unknown"} ($${Math.abs(json.amount).toFixed(2)}). Check your WhatsApp in ~10s.`,
          { id: toastId, duration: 8000 },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        toast.error(`Test failed: ${message}`, { id: toastId });
      }
    });
  }

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={pending}
        onClick={run}
        title="Send test WhatsApp for this transaction"
        className="text-muted-foreground/40 hover:text-foreground"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <MessageCircle className="size-3" strokeWidth={1.6} />
        )}
        <span className="sr-only">Send test WhatsApp for this transaction</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={run}
      title="Send one test WhatsApp notification (most recent non-transfer transaction)"
      className="text-muted-foreground hover:text-foreground"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <MessageCircle className="size-3.5" strokeWidth={1.6} />
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
        test wa
      </span>
    </Button>
  );
}
