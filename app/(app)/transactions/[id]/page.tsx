import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ArrowLeftRight, Undo2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CategoryPill, type CategoryMeta } from "@/components/app/category-pill";
import { CategoryPicker } from "@/components/app/category-picker";
import { SourceTag } from "@/components/app/source-tag";
import { TestWhatsAppButton } from "@/components/app/test-whatsapp-button";
import { EditControls } from "@/components/app/transactions/edit-controls";
import {
  AttachmentGrid,
  type AttachmentRow,
} from "@/components/app/transactions/attachment-grid";
import {
  ConversationLog,
  type WAMessage,
} from "@/components/app/transactions/conversation-log";
import { formatCurrency, formatDate, formatRelative } from "@/lib/format";
import type { SplitType } from "@/app/(app)/transactions/[id]/actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: tx } = await supabase
    .from("transactions")
    .select(
      "id, account_id, amount, effective_amount, currency, date, authorized_date, merchant_name, name, plaid_category, plaid_category_detail, plaid_confidence, ai_category, ai_confidence, ai_reasoning, user_category, category_source, is_pending, is_transfer, is_refund, transfer_pair_id, refund_pair_id, split_type, split_value, split_raw_input, split_note, notes, excluded_from_stats, last_user_edit_at, last_notified_at, notified_amount, raw, created_at, updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!tx) notFound();

  const [{ data: account }, { data: attachments }, { data: messages }, { data: categories }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, mask, type, subtype, official_name")
        .eq("id", tx.account_id)
        .maybeSingle(),
      supabase
        .from("transaction_attachments")
        .select("id, storage_path, mime_type, size_bytes, source, created_at")
        .eq("transaction_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("whatsapp_messages")
        .select("id, direction, body, intent, status, created_at")
        .eq("related_transaction_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("categories")
        .select("name, color, icon, sort_order")
        .order("sort_order", { ascending: true }),
    ]);

  const categoryList: CategoryMeta[] = (categories ?? []).map((c) => ({
    name: c.name,
    color: c.color,
    icon: c.icon,
  }));
  const categoryByName = new Map(categoryList.map((c) => [c.name, c]));

  const merchant = tx.merchant_name ?? tx.name ?? "—";
  const isCredit = tx.amount < 0;
  const displayAmount =
    tx.effective_amount != null && tx.split_type !== "none"
      ? Number(tx.effective_amount)
      : Number(tx.amount);
  const category =
    tx.user_category && categoryByName.get(tx.user_category)
      ? categoryByName.get(tx.user_category)!
      : tx.user_category
        ? { name: tx.user_category, color: null, icon: null }
        : null;

  const splitType = (tx.split_type ?? "none") as SplitType;

  return (
    <div className="space-y-10">
      {/* Top crumb back to list */}
      <p className="reveal reveal-1">
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70 hover:text-foreground"
        >
          <ChevronLeft className="size-3" strokeWidth={1.6} />
          back to ledger
        </Link>
      </p>

      {/* Hero — date kicker, merchant title, amount column */}
      <header className="reveal reveal-1 space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
          {formatDate(tx.date)}
          {tx.is_pending ? (
            <span className="ml-3 text-amber-400/85">pending</span>
          ) : null}
          {tx.is_transfer ? (
            <span className="ml-3 inline-flex items-center gap-1 text-muted-foreground">
              <ArrowLeftRight className="size-3" strokeWidth={1.6} />
              transfer
            </span>
          ) : null}
          {tx.is_refund ? (
            <span className="ml-3 inline-flex items-center gap-1 text-emerald-300">
              <Undo2 className="size-3" strokeWidth={1.6} />
              refund
            </span>
          ) : null}
          {splitType !== "none" ? (
            <span className="ml-3 inline-flex items-center gap-1 text-primary/85">
              <Sparkles className="size-3" strokeWidth={1.6} />
              split
            </span>
          ) : null}
        </p>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="font-display text-4xl italic font-normal leading-[1] text-foreground">
              {merchant}
            </h1>
            {tx.merchant_name && tx.name && tx.merchant_name !== tx.name ? (
              <p className="font-mono text-[12px] text-muted-foreground/70">
                {tx.name}
              </p>
            ) : null}
          </div>

          <div className="text-right">
            <p
              className={cn(
                "font-mono text-3xl tabular-nums",
                isCredit ? "text-emerald-300/95" : "text-foreground/95",
              )}
            >
              {isCredit
                ? `+${formatCurrency(Math.abs(displayAmount))}`
                : formatCurrency(displayAmount)}
            </p>
            {splitType !== "none" &&
            tx.effective_amount != null &&
            Number(tx.effective_amount) !== Number(tx.amount) ? (
              <p className="font-mono text-[12px] tabular-nums text-muted-foreground/65">
                of {formatCurrency(Math.abs(Number(tx.amount)))}
              </p>
            ) : null}
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">
              {account?.name ?? "—"}
              {account?.mask ? ` · ···${account.mask}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {tx.is_transfer ? (
            <CategoryPill category={category} size="md" />
          ) : (
            <CategoryPicker
              transactionId={tx.id}
              current={category}
              options={categoryList}
            />
          )}
          <SourceTag source={tx.category_source} />
          <TestWhatsAppButton transactionId={tx.id} />
        </div>

        <div className="rule-amber w-20" />
      </header>

      {/* Two-column body */}
      <div className="reveal reveal-2 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Left: edit controls + attachments */}
        <div className="space-y-10">
          <section className="rounded-xl border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
              Edits
            </p>
            <div className="mt-4">
              <EditControls
                transactionId={tx.id}
                amount={Number(tx.amount)}
                initialSplitType={splitType}
                initialSplitValue={
                  tx.split_value != null ? Number(tx.split_value) : null
                }
                initialSplitRaw={tx.split_raw_input}
                initialNotes={tx.notes}
                initialExcluded={!!tx.excluded_from_stats}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
              Attachments
            </p>
            <div className="mt-4">
              <AttachmentGrid
                attachments={(attachments ?? []) as AttachmentRow[]}
              />
            </div>
          </section>
        </div>

        {/* Right: facts + conversation + raw */}
        <div className="space-y-10">
          <section className="rounded-xl border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
              Facts
            </p>
            <dl className="mt-4 space-y-2.5 text-[13px]">
              <Fact label="Posted" value={formatDate(tx.date)} />
              {tx.authorized_date && tx.authorized_date !== tx.date ? (
                <Fact label="Authorized" value={formatDate(tx.authorized_date)} />
              ) : null}
              <Fact
                label="Plaid category"
                value={
                  tx.plaid_category
                    ? `${tx.plaid_category}${tx.plaid_category_detail ? ` · ${tx.plaid_category_detail}` : ""}${tx.plaid_confidence ? ` (${tx.plaid_confidence})` : ""}`
                    : "—"
                }
              />
              {tx.ai_category ? (
                <Fact
                  label="AI guess"
                  value={`${tx.ai_category}${tx.ai_confidence != null ? ` · ${(Number(tx.ai_confidence) * 100).toFixed(0)}%` : ""}${tx.ai_reasoning ? ` — ${tx.ai_reasoning}` : ""}`}
                />
              ) : null}
              <Fact
                label="Source of category"
                value={tx.category_source ?? "—"}
              />
              {tx.notified_amount != null ? (
                <Fact
                  label="Last WA ping"
                  value={
                    tx.last_notified_at
                      ? `${formatRelative(tx.last_notified_at)} · ${formatCurrency(Number(tx.notified_amount))}`
                      : "—"
                  }
                />
              ) : null}
              {tx.last_user_edit_at ? (
                <Fact
                  label="Last edit"
                  value={formatRelative(tx.last_user_edit_at)}
                />
              ) : null}
              <Fact
                label="Pair"
                value={
                  tx.transfer_pair_id ? (
                    <Link
                      href={`/transactions/${tx.transfer_pair_id}`}
                      className="text-foreground underline underline-offset-2 decoration-primary/40 hover:decoration-primary"
                    >
                      transfer match →
                    </Link>
                  ) : tx.refund_pair_id ? (
                    <Link
                      href={`/transactions/${tx.refund_pair_id}`}
                      className="text-foreground underline underline-offset-2 decoration-primary/40 hover:decoration-primary"
                    >
                      refund match →
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Fact label="Currency" value={tx.currency ?? "USD"} />
              <Fact
                label="Account type"
                value={
                  account
                    ? `${account.type}${account.subtype ? ` · ${account.subtype}` : ""}`
                    : "—"
                }
              />
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
              WhatsApp thread
            </p>
            <div className="mt-4">
              <ConversationLog messages={(messages ?? []) as WAMessage[]} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <details>
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80 hover:text-foreground">
                Raw Plaid payload
              </summary>
              <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-background/40 p-4 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                {JSON.stringify(tx.raw, null, 2)}
              </pre>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/65">
        {label}
      </dt>
      <dd className="text-[13px] text-foreground/90">{value}</dd>
    </div>
  );
}
