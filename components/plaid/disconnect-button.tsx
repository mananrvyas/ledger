"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Disconnect a linked Plaid item. Shows a confirm dialog with an opt-in
 * checkbox to ALSO wipe the transaction history for accounts on this item.
 *
 * Default behavior (checkbox unchecked):
 *   - calls Plaid `itemRemove` (best-effort)
 *   - sets plaid_items.status = 'disconnected'
 *   - archives all accounts on the item
 *   - KEEPS transactions for history
 *
 * With "wipe data" checked:
 *   - same as above, but also soft-deletes every transaction on those accounts
 */
export function DisconnectButton({
  plaidItemId,
  institutionName,
}: {
  plaidItemId: string;
  institutionName: string;
}) {
  const [open, setOpen] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const toastId = toast.loading(
        wipe ? "Disconnecting + wiping history…" : "Disconnecting…",
      );
      try {
        const res = await fetch("/api/plaid/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plaid_item_id: plaidItemId,
            wipe_transactions: wipe,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          plaid_remove_status: string;
          accounts_archived: number;
          transactions_deleted: number;
        };
        toast.success(
          wipe
            ? `${institutionName} disconnected. ${json.transactions_deleted} transaction${json.transactions_deleted === 1 ? "" : "s"} removed.`
            : `${institutionName} disconnected. ${json.accounts_archived} account${json.accounts_archived === 1 ? "" : "s"} archived.`,
          { id: toastId, duration: 6000 },
        );
        setOpen(false);
        setWipe(false);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        toast.error(`Disconnect failed: ${message}`, { id: toastId });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground/70 hover:text-destructive"
          />
        }
      >
        <Trash2 className="size-3.5" strokeWidth={1.6} />
        Disconnect
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect {institutionName}?</DialogTitle>
          <DialogDescription>
            Plaid will release this item and we&apos;ll mark it disconnected.
            You can re-link this institution later — just connect it again
            from the Accounts page.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3">
          <input
            type="checkbox"
            checked={wipe}
            onChange={(e) => setWipe(e.target.checked)}
            className="mt-0.5 size-4 cursor-pointer accent-destructive"
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Also wipe transaction history
            </p>
            <p className="text-xs text-muted-foreground">
              Soft-deletes every transaction on these accounts. Useful for
              clearing sandbox data before connecting a real bank. Not
              reversible from the UI.
            </p>
          </div>
        </label>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant={wipe ? "destructive" : "default"}
            size="sm"
            onClick={run}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" strokeWidth={1.6} />
            )}
            {wipe ? "Disconnect & wipe" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
