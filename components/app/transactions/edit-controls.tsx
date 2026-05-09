"use client";

import { useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  setExcluded,
  updateNotes,
  updateSplit,
  type SplitType,
} from "@/app/(app)/transactions/[id]/actions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Edit affordances for a single transaction: split, notes, exclude. Wraps
 * server actions so the parent page revalidates automatically and the
 * realtime listener re-fetches.
 *
 * Category editing already lives in the existing <CategoryPicker/> mounted
 * separately; we don't duplicate it here.
 */
export function EditControls({
  transactionId,
  amount,
  initialSplitType,
  initialSplitValue,
  initialSplitRaw,
  initialNotes,
  initialExcluded,
}: {
  transactionId: string;
  amount: number;
  initialSplitType: SplitType;
  initialSplitValue: number | null;
  initialSplitRaw: string | null;
  initialNotes: string | null;
  initialExcluded: boolean;
}) {
  return (
    <div className="space-y-6">
      <SplitEditor
        transactionId={transactionId}
        amount={amount}
        initialSplitType={initialSplitType}
        initialSplitValue={initialSplitValue}
        initialSplitRaw={initialSplitRaw}
      />
      <NotesEditor
        transactionId={transactionId}
        initialNotes={initialNotes}
      />
      <ExcludeToggle
        transactionId={transactionId}
        initialExcluded={initialExcluded}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

function SplitEditor({
  transactionId,
  amount,
  initialSplitType,
  initialSplitValue,
  initialSplitRaw,
}: {
  transactionId: string;
  amount: number;
  initialSplitType: SplitType;
  initialSplitValue: number | null;
  initialSplitRaw: string | null;
}) {
  const [splitType, setSplitType] = useState<SplitType>(initialSplitType);
  const [text, setText] = useState<string>(
    initialSplitRaw ?? initialSplitValue?.toString() ?? "",
  );
  const [pending, startTransition] = useTransition();

  const parsed = parseSplitText(splitType, text);
  const preview =
    parsed.value != null ? computeShare(amount, splitType, parsed.value) : null;

  function save() {
    startTransition(async () => {
      const res =
        splitType === "none"
          ? await updateSplit(transactionId, "none", null, null)
          : parsed.value != null
            ? await updateSplit(transactionId, splitType, parsed.value, text)
            : { ok: false, error: "couldn't read that split" };
      if (res.ok) toast.success("Split saved.");
      else toast.error(res.error ?? "couldn't save split");
    });
  }

  function clear() {
    setSplitType("none");
    setText("");
    startTransition(async () => {
      const res = await updateSplit(transactionId, "none", null, null);
      if (res.ok) toast.success("Split cleared.");
      else toast.error(res.error ?? "couldn't clear split");
    });
  }

  return (
    <section>
      <header className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Split
        </p>
        {initialSplitType !== "none" ? (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 hover:text-foreground"
          >
            <X className="size-3" strokeWidth={1.6} /> remove
          </button>
        ) : null}
      </header>

      <div className="mt-3 inline-flex rounded-full border border-hairline bg-card/60 p-0.5">
        {(["none", "percent", "fixed", "ratio"] as SplitType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSplitType(t)}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
              splitType === t
                ? "bg-primary/15 text-foreground ring-1 ring-primary/30"
                : "text-muted-foreground/75 hover:text-foreground/90",
            )}
          >
            {t === "none" ? "No split" : t}
          </button>
        ))}
      </div>

      {splitType !== "none" ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                splitType === "percent"
                  ? "20"
                  : splitType === "fixed"
                    ? "8.50"
                    : "1/3"
              }
              className="h-9 w-32 rounded-md border border-hairline bg-card px-3 font-mono text-[13px] tabular-nums outline-none focus:border-primary/40"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground/65">
              {splitType === "percent"
                ? "% of total"
                : splitType === "fixed"
                  ? "$ flat"
                  : "ratio (e.g. 1/3)"}
            </span>
          </div>

          {preview != null ? (
            <p className="font-mono text-[12px] tabular-nums text-emerald-300/80">
              your share · {formatCurrency(preview)} of{" "}
              {formatCurrency(amount)}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground/60">
              {parsed.error ?? "—"}
            </p>
          )}

          <button
            type="button"
            onClick={save}
            disabled={pending || preview == null}
            className="rounded-md bg-primary/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground ring-1 ring-primary/30 hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="mr-1 inline size-3" strokeWidth={1.6} />
            {pending ? "saving…" : "save split"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function NotesEditor({
  transactionId,
  initialNotes,
}: {
  transactionId: string;
  initialNotes: string | null;
}) {
  const [text, setText] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = (initialNotes ?? "") !== text;

  function save() {
    startTransition(async () => {
      const res = await updateNotes(transactionId, text);
      if (res.ok) toast.success("Note saved.");
      else toast.error(res.error ?? "couldn't save note");
    });
  }

  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
        Notes
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Why is this here? Anything to remember about it?"
        rows={3}
        className="mt-3 w-full rounded-md border border-hairline bg-card px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty}
        className="mt-2 rounded-md border border-hairline bg-card/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-primary/30 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "saving…" : dirty ? "save note" : "saved"}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Exclude
// ---------------------------------------------------------------------------

function ExcludeToggle({
  transactionId,
  initialExcluded,
}: {
  transactionId: string;
  initialExcluded: boolean;
}) {
  const [excluded, setLocal] = useState(initialExcluded);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !excluded;
    setLocal(next);
    startTransition(async () => {
      const res = await setExcluded(transactionId, next);
      if (!res.ok) {
        setLocal(!next);
        toast.error(res.error ?? "couldn't update");
      } else {
        toast.success(next ? "excluded from stats" : "back in stats");
      }
    });
  }

  return (
    <section className="flex items-center justify-between gap-4 rounded-md border border-hairline bg-card/40 px-4 py-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Exclude from stats
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground/65">
          {excluded
            ? "Hidden from dashboard totals + charts."
            : "Counted in dashboard totals + charts."}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={excluded}
        className={cn(
          "relative h-5 w-9 rounded-full border transition-colors",
          excluded
            ? "border-primary/40 bg-primary/30"
            : "border-hairline bg-card/60",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full bg-foreground transition-transform",
            excluded ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Split parsing
// ---------------------------------------------------------------------------

function parseSplitText(
  type: SplitType,
  raw: string,
): { value: number | null; error: string | null } {
  const text = raw.trim();
  if (type === "none" || text === "") return { value: null, error: null };

  if (type === "percent") {
    const cleaned = text.replace(/%$/, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0 || n > 100)
      return { value: null, error: "percent must be 1–100" };
    return { value: n, error: null };
  }

  if (type === "fixed") {
    const cleaned = text.replace(/^\$/, "").replace(/,/g, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0)
      return { value: null, error: "expected a dollar amount" };
    return { value: n, error: null };
  }

  // ratio: accept "1/3", "1:3", "0.333"
  const slash = text.match(/^(\d+(?:\.\d+)?)\s*[\/:]\s*(\d+(?:\.\d+)?)$/);
  if (slash) {
    const num = Number(slash[1]);
    const den = Number(slash[2]);
    if (den <= 0) return { value: null, error: "denominator must be > 0" };
    const fraction = num / den;
    if (fraction <= 0 || fraction > 1)
      return { value: null, error: "ratio must resolve between 0 and 1" };
    return { value: fraction, error: null };
  }
  const n = Number(text);
  if (Number.isFinite(n) && n > 0 && n <= 1) return { value: n, error: null };
  return { value: null, error: "couldn't parse ratio" };
}

function computeShare(
  amount: number,
  type: SplitType,
  value: number,
): number | null {
  if (type === "percent") return amount * (value / 100);
  if (type === "fixed") return value;
  if (type === "ratio") return amount * value;
  return null;
}
