"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PlaidLinkButtonProps = {
  /** When provided, opens Link in update-mode for the given Plaid item. */
  reconnectItemId?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  label?: string;
  className?: string;
};

/**
 * Wraps react-plaid-link with our token + exchange flow.
 *
 * 1. On mount (or click), POST /api/plaid/link/create-token → link_token.
 * 2. Open Plaid Link iframe via usePlaidLink.
 * 3. On success, POST /api/plaid/link/exchange with public_token + metadata.
 * 4. Refresh the page so server components pick up the new item.
 */
export function PlaidLinkButton({
  reconnectItemId,
  variant = "default",
  size = "default",
  label,
  className,
}: PlaidLinkButtonProps) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);

  // Fetch link token on mount (or when reconnectItemId changes).
  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      setTokenError(null);
      try {
        const res = await fetch("/api/plaid/link/create-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reconnectItemId ? { access_token_for_item: reconnectItemId } : {},
          ),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { link_token?: string };
        if (!cancelled && json.link_token) {
          setLinkToken(json.link_token);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to start Plaid Link";
          setTokenError(message);
        }
      }
    }

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [reconnectItemId]);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setExchanging(true);
      try {
        const res = await fetch("/api/plaid/link/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            metadata: {
              institution: metadata.institution
                ? {
                    institution_id: metadata.institution.institution_id,
                    name: metadata.institution.name,
                  }
                : undefined,
            },
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          institution_name?: string | null;
          account_count?: number;
        };
        toast.success(
          `Connected ${json.institution_name ?? "account"}${
            json.account_count ? ` · ${json.account_count} account(s)` : ""
          }`,
        );
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to link account";
        toast.error(`Connection failed: ${message}`);
      } finally {
        setExchanging(false);
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) {
        toast.error(err.display_message ?? err.error_message ?? "Plaid exited");
      }
    },
  });

  const handleClick = () => {
    if (tokenError) {
      toast.error(tokenError);
      return;
    }
    if (ready) open();
  };

  const isLoading = !ready || exchanging;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isLoading || !!tokenError}
      className={className}
    >
      {exchanging ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Connecting…
        </>
      ) : !ready ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Preparing…
        </>
      ) : (
        <>
          <Plus className="size-4" />
          {label ?? (reconnectItemId ? "Reconnect" : "Connect a bank")}
        </>
      )}
    </Button>
  );
}
