"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ArrowLeftRight, Undo2, Sparkles } from "lucide-react";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { CategoryPicker } from "@/components/app/category-picker";
import { SourceTag } from "@/components/app/source-tag";
import { TestWhatsAppButton } from "@/components/app/test-whatsapp-button";
import { formatCurrency, formatShortDate, prettyType } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TxRow = {
  id: string;
  account_id: string;
  amount: number;
  effective_amount: number | null;
  date: string;
  merchant_name: string | null;
  name: string | null;
  is_pending: boolean;
  is_transfer: boolean;
  is_refund: boolean;
  user_category: string | null;
  category_source: string | null;
  excluded_from_stats: boolean;
  split_type: string;
};

export type AccountInfo = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
};

/**
 * Client-side row renderer for /transactions with infinite scroll. The page
 * server-renders the first chunk; we hold them as initial state and append
 * subsequent pages as the user scrolls (IntersectionObserver, 400px-rootMargin
 * sentinel below the list).
 *
 * Maps for `accountList` + `categoryList` are reconstructed inside the
 * component because Map instances aren't serializable across server→client.
 */
export function TransactionsList({
  initialRows,
  initialTotal,
  pageSize,
  accountList,
  categoryList,
}: {
  initialRows: TxRow[];
  initialTotal: number;
  pageSize: number;
  accountList: AccountInfo[];
  categoryList: CategoryMeta[];
}) {
  const [rows, setRows] = useState<TxRow[]>(initialRows);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const accountById = useMemo(
    () => new Map(accountList.map((a) => [a.id, a])),
    [accountList],
  );
  const categoryByName = useMemo(
    () => new Map(categoryList.map((c) => [c.name, c])),
    [categoryList],
  );

  const hasMore = rows.length < total;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/transactions?offset=${rows.length}&limit=${pageSize}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { rows: TxRow[]; total: number };
      setRows((prev) => {
        // Dedupe by id in case realtime + page-fetch race produce overlap.
        const seen = new Set(prev.map((r) => r.id));
        const dedup = json.rows.filter((r) => !seen.has(r.id));
        return [...prev, ...dedup];
      });
      setTotal(json.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, rows.length, pageSize]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            void loadMore();
          }
        }
      },
      { rootMargin: "400px 0px 400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return (
    <>
      <ul className="divide-y divide-hairline">
        {rows.map((t) => {
          const account = accountById.get(t.account_id);
          const isCredit = t.amount < 0;
          const merchant = t.merchant_name ?? t.name ?? "—";
          const subtitle =
            t.merchant_name && t.name && t.merchant_name !== t.name
              ? t.name
              : null;
          const category =
            t.user_category && categoryByName.get(t.user_category)
              ? categoryByName.get(t.user_category)!
              : t.user_category
                ? { name: t.user_category, color: null, icon: null }
                : null;

          const displayAmount =
            t.effective_amount != null && t.split_type !== "none"
              ? t.effective_amount
              : t.amount;

          return (
            <li
              key={t.id}
              className={cn(
                "group grid grid-cols-[96px_1fr_180px_140px_140px_28px] items-baseline gap-4 px-6 py-3 transition-colors hover:bg-foreground/[0.025]",
                t.excluded_from_stats && "opacity-55",
              )}
            >
              {/* Date */}
              <div className="space-y-0.5 font-mono text-[12px] tabular-nums text-muted-foreground">
                <p className="text-foreground/85">{formatShortDate(t.date)}</p>
                {t.is_pending ? (
                  <p className="text-[9px] uppercase tracking-[0.18em] text-amber-400/85">
                    pending
                  </p>
                ) : null}
              </div>

              {/* Merchant */}
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] text-foreground">
                    {merchant}
                  </p>
                  {t.is_transfer ? (
                    <ArrowLeftRight
                      className="size-3 shrink-0 text-muted-foreground/60"
                      strokeWidth={1.6}
                      aria-label="Transfer"
                    />
                  ) : null}
                  {t.is_refund ? (
                    <Undo2
                      className="size-3 shrink-0 text-emerald-400/70"
                      strokeWidth={1.6}
                      aria-label="Refund"
                    />
                  ) : null}
                  {t.split_type !== "none" ? (
                    <Sparkles
                      className="size-3 shrink-0 text-primary/70"
                      strokeWidth={1.6}
                      aria-label="Split"
                    />
                  ) : null}
                </div>
                {subtitle ? (
                  <p className="truncate font-mono text-[11px] text-muted-foreground/65">
                    {subtitle}
                  </p>
                ) : null}
              </div>

              {/* Category */}
              <div className="flex min-w-0 items-center gap-2">
                {t.is_transfer ? (
                  <CategoryPill category={category} size="md" />
                ) : (
                  <CategoryPicker
                    transactionId={t.id}
                    current={category}
                    options={categoryList}
                  />
                )}
                <SourceTag source={t.category_source} />
              </div>

              {/* Account */}
              <div className="space-y-0.5 min-w-0">
                <p className="truncate text-[12px] text-muted-foreground">
                  {account?.name ?? "—"}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                  {account?.mask
                    ? `···${account.mask}`
                    : prettyType(account?.type)}
                </p>
              </div>

              {/* Amount */}
              <div className="space-y-0.5 text-right">
                <p
                  className={cn(
                    "font-mono tabular-nums text-[14px]",
                    isCredit ? "text-emerald-300/95" : "text-foreground/95",
                  )}
                >
                  {isCredit
                    ? `+${formatCurrency(Math.abs(displayAmount))}`
                    : formatCurrency(displayAmount)}
                </p>
                {t.split_type !== "none" &&
                t.effective_amount != null &&
                t.effective_amount !== t.amount ? (
                  <p className="font-mono text-[10px] tabular-nums text-muted-foreground/55">
                    of {formatCurrency(Math.abs(t.amount))}
                  </p>
                ) : null}
              </div>

              {/* Per-row test WA */}
              <div className="flex items-center justify-end self-center opacity-30 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <TestWhatsAppButton transactionId={t.id} compact />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Sentinel + status footer */}
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="border-t border-hairline px-6 py-5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55"
        >
          {loading
            ? `loading more · ${rows.length} of ${total}`
            : error
              ? `couldn't load more — scroll to retry · ${error}`
              : `scroll for more · ${rows.length} of ${total}`}
        </div>
      ) : (
        <div className="border-t border-hairline px-6 py-5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">
          end of ledger · {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </div>
      )}
    </>
  );
}
