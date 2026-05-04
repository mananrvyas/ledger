"use client";

import { useTransition } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Test-fire a single WhatsApp notification for one transaction. Used to
 * verify Twilio creds + sandbox pairing without flooding your phone with
 * the full backfill. The route picks the most recent non-transfer tx if no
 * id is passed.
 */
export function TestWhatsAppButton({
  transactionId,
}: {
  transactionId?: string;
}) {
  const [pending, startTransition] = useTransition();

  function run() {
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
