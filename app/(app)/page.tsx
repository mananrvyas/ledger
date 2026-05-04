import Link from "next/link";
import { ArrowUpRight, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <div className="space-y-12">
      <header className="reveal reveal-1 space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Overview
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-5xl italic font-normal leading-[1] text-foreground">
            Dashboard.
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Spending, net worth, and recent activity will land here once a bank
            is connected.
          </p>
        </div>
        <div className="rule-amber w-20" />
      </header>

      {/* Empty-state card with quiet presence */}
      <section className="reveal reveal-2">
        <div className="grid gap-0 overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5 p-8 md:p-10">
            <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Landmark className="size-5" strokeWidth={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-normal leading-tight">
                No accounts yet.
              </h2>
              <p className="max-w-md text-[14px] leading-relaxed text-muted-foreground">
                Plaid integration ships in the next phase. Connecting a bank
                will start a quiet, real-time stream of transactions into your
                ledger.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button disabled className="h-9 px-3 font-medium tracking-wide">
                Connect a bank
              </Button>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                arriving in phase 1
              </span>
            </div>
          </div>

          {/* Decorative ledger column */}
          <div className="relative hidden border-l border-hairline bg-background/40 md:block">
            <div className="absolute inset-0 grid grid-rows-[repeat(8,1fr)]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="border-b border-hairline/60 last:border-b-0"
                />
              ))}
            </div>
            <div className="relative grid h-full grid-rows-[repeat(8,1fr)] px-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between font-mono text-[11px] text-muted-foreground/30"
                >
                  <span className="tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>—</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What's coming row — three quiet cards previewing future surfaces */}
      <section className="reveal reveal-3 space-y-5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
            Coming soon
          </h3>
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/50">
            see docs/07-build-plan.md
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              kicker: "phase 1",
              title: "Plaid plumbing",
              body: "Connect Amex, Chase, Discover, Robinhood, PayPal. Raw transactions begin to flow.",
            },
            {
              kicker: "phase 2",
              title: "Categorization",
              body: "Plaid → learned rules → Claude. Transfers paired across accounts.",
            },
            {
              kicker: "phase 3",
              title: "WhatsApp ledger",
              body: "Each new transaction pings within minutes. Reply to recategorize, split, or note.",
            },
          ].map((c) => (
            <article
              key={c.title}
              className="group relative overflow-hidden rounded-lg border border-border bg-card/60 p-5 transition-colors hover:border-primary/30"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
                    {c.kicker}
                  </span>
                  <ArrowUpRight
                    className="size-3.5 text-muted-foreground/40 transition-colors group-hover:text-primary"
                    strokeWidth={1.5}
                  />
                </div>
                <h4 className="font-display text-lg font-normal leading-snug">
                  {c.title}
                </h4>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {c.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className="reveal reveal-4 pt-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/40">
        <Link href="#" className="hover:text-muted-foreground">
          a quiet ledger
        </Link>
      </p>
    </div>
  );
}
