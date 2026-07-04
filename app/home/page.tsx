import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BellRing,
  Camera,
  Check,
  Landmark,
  LineChart,
  MessageCircle,
  Paperclip,
  ReceiptText,
  Sparkles,
  SplitSquareHorizontal,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Ledger — your money, texting you back",
  description:
    "Every bank transaction pings you on WhatsApp within minutes, already categorized. Reply in plain English to fix it. Free for now.",
};

/* ----------------------------------------------------------------------------
 * Marketing page — "Quiet Ledger" broadsheet.
 *
 * Fully static server component. All motion is CSS-only (reveal stagger,
 * ledger ticker, slow float on the phone). Anonymous visitors to "/" are
 * rewritten here by the proxy; signed-in users never see this page.
 * --------------------------------------------------------------------------*/

export default function MarketingPage() {
  return (
    <div className="relative overflow-x-clip">
      <Backdrop />
      <TopBar />
      <main>
        <Hero />
        <LedgerTicker />
        <HowItWorks />
        <Waterfall />
        <DashboardTeaser />
        <Pricing />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}

/* -- atmosphere ------------------------------------------------------------ */

function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -top-[35vh] left-1/2 size-[95vh] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-[130px]" />
      <div className="absolute -bottom-[45vh] right-[-12vh] size-[75vh] rounded-full bg-primary/[0.05] blur-[130px]" />
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          aria-label="Ledger — home"
          className="transition-opacity hover:opacity-85"
        >
          <Brand size="md" />
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            render={<Link href="/login" />}
            nativeButton={false}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Button>
          <Button
            render={<Link href="/signup" />}
            nativeButton={false}
            size="sm"
            className="font-medium tracking-wide"
          >
            Get started
          </Button>
        </nav>
      </div>
    </header>
  );
}

/* -- hero ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-16 px-6 pb-24 pt-20 md:pb-32 md:pt-28 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-9">
        <p className="reveal reveal-1 font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
          your bank · your phone · minutes apart
        </p>

        <h1 className="reveal reveal-2 font-display text-[clamp(2.9rem,7vw,4.9rem)] font-normal leading-[1.02] text-foreground">
          Your money,
          <br />
          <em className="italic text-primary">texting you back.</em>
        </h1>

        <div className="reveal reveal-3 rule-amber w-16" />

        <p className="reveal reveal-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          Every card swipe lands in your WhatsApp within minutes — already
          categorized. Reply in plain English to fix it:{" "}
          <span className="text-foreground/90">
            &ldquo;that&rsquo;s groceries&rdquo;
          </span>
          , <span className="text-foreground/90">&ldquo;split 1/3&rdquo;</span>,
          or just attach the receipt.
        </p>

        <div className="reveal reveal-4 flex flex-wrap items-center gap-4">
          <Button
            render={<Link href="/signup" />}
            nativeButton={false}
            size="lg"
            className="h-11 px-6 font-medium tracking-wide"
          >
            Open your ledger
            <ArrowRight data-icon="inline-end" className="size-4" />
          </Button>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
            free for now · no card required
          </span>
        </div>
      </div>

      <PhoneMockup />
    </section>
  );
}

function PhoneMockup() {
  return (
    <div className="reveal reveal-4 relative mx-auto w-full max-w-[360px]">
      {/* ledger ruling behind the phone */}
      <div
        aria-hidden
        className="absolute -inset-x-16 inset-y-8 -z-10 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent, transparent 27px, var(--hairline) 27px, var(--hairline) 28px)",
        }}
      />
      <div className="float-slow rounded-[2rem] border border-border bg-card/90 p-3 shadow-[0_24px_80px_-24px_oklch(0_0_0/0.55)] backdrop-blur">
        <div className="rounded-[1.55rem] border border-hairline bg-background/70 px-4 pb-5 pt-4">
          {/* chat header */}
          <div className="mb-4 flex items-center gap-3 border-b border-hairline pb-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 font-display text-lg italic text-primary">
              ƒ
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-medium text-foreground">Ledger</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-success/90">
                online
              </p>
            </div>
            <MessageCircle
              className="ml-auto size-4 text-muted-foreground/50"
              strokeWidth={1.5}
            />
          </div>

          {/* thread */}
          <div className="space-y-2.5">
            <Bubble side="left" className="reveal reveal-5" time="6:42 pm">
              <span className="font-mono text-[12px] tabular-nums text-foreground">
                −$84.20
              </span>{" "}
              at <span className="text-foreground">Trader Joe&rsquo;s</span> ·
              Amex Gold
              <span className="mt-1.5 flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-chart-2" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  filed under groceries
                </span>
              </span>
            </Bubble>

            <Bubble side="right" className="reveal reveal-6" time="6:44 pm">
              actually eating out, split 1/3
            </Bubble>

            <Bubble side="left" className="reveal reveal-7" time="6:44 pm">
              ✓ Recategorized to{" "}
              <span className="text-foreground">Eating Out</span> — your share
              is{" "}
              <span className="font-mono text-[12px] tabular-nums text-foreground">
                $28.07
              </span>
              .
            </Bubble>

            <Bubble side="right" className="reveal reveal-8" time="6:45 pm">
              <span className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-md border border-hairline bg-muted">
                  <Camera
                    className="size-3.5 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </span>
                <span className="text-muted-foreground">receipt.jpg</span>
              </span>
            </Bubble>

            <Bubble side="left" className="reveal reveal-8" time="6:45 pm">
              <span className="flex items-center gap-1.5">
                <Paperclip
                  className="size-3 text-primary/80"
                  strokeWidth={1.6}
                />
                Receipt attached.
              </span>
            </Bubble>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  side,
  time,
  className,
  children,
}: {
  side: "left" | "right";
  time: string;
  className?: string;
  children: React.ReactNode;
}) {
  const left = side === "left";
  return (
    <div
      className={cn("flex", left ? "justify-start" : "justify-end", className)}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-xl border px-3 py-2 text-[12.5px] leading-relaxed",
          left
            ? "rounded-bl-sm border-hairline bg-card text-foreground/90"
            : "rounded-br-sm border-primary/25 bg-primary/[0.09] text-foreground/95",
        )}
      >
        {children}
        <span className="mt-1 block text-right font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/55">
          {time}
        </span>
      </div>
    </div>
  );
}

/* -- ledger ticker ----------------------------------------------------------- */

const TICKER_ENTRIES: Array<{
  merchant: string;
  amount: string;
  category: string;
}> = [
  { merchant: "Blue Bottle", amount: "−$6.75", category: "Coffee" },
  { merchant: "United Airlines", amount: "−$412.30", category: "Travel" },
  { merchant: "Trader Joe's", amount: "−$84.20", category: "Groceries" },
  { merchant: "Payroll", amount: "+$4,250.00", category: "Income" },
  { merchant: "Con Edison", amount: "−$96.12", category: "Utilities" },
  { merchant: "Equinox", amount: "−$205.00", category: "Fitness" },
  { merchant: "Sweetgreen", amount: "−$16.40", category: "Eating Out" },
  { merchant: "Venmo refund", amount: "+$28.07", category: "Refund" },
];

function LedgerTicker() {
  const row = (ariaHidden: boolean) => (
    <div
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-center"
    >
      {TICKER_ENTRIES.map((e) => (
        <span
          key={`${e.merchant}-${e.amount}`}
          className="flex items-center gap-3 whitespace-nowrap px-7 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/75"
        >
          <span className="size-1 rounded-full bg-primary/70" />
          {e.merchant}
          <span
            className={cn(
              "tabular-nums",
              e.amount.startsWith("+") ? "text-success" : "text-foreground/85",
            )}
          >
            {e.amount}
          </span>
          <span className="text-muted-foreground/45">{e.category}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden border-y border-hairline bg-card/40 py-3.5">
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/* -- how it works ------------------------------------------------------------ */

const STEPS = [
  {
    n: "01",
    icon: Landmark,
    title: "Link your banks",
    body: "Connect checking, credit cards, and brokerages through Plaid. Tokens are encrypted at rest; transactions sync within minutes of posting.",
  },
  {
    n: "02",
    icon: BellRing,
    title: "Get pinged on WhatsApp",
    body: "Every posted transaction arrives as a message — amount, merchant, account, and a category already applied. No app to open, nothing to remember.",
  },
  {
    n: "03",
    icon: MessageCircle,
    title: "Reply in plain English",
    body: "“That's travel and split half.” One reply can recategorize, split, note, exclude — or all at once. Attach a photo and the receipt files itself.",
  },
] as const;

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 md:py-32">
      <SectionKicker>how it works</SectionKicker>
      <h2 className="mt-4 max-w-xl font-display text-4xl font-normal leading-[1.08] text-foreground md:text-5xl">
        Bookkeeping, reduced to <em className="italic text-primary">a text.</em>
      </h2>

      <div className="mt-16 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline md:grid-cols-3">
        {STEPS.map((step) => (
          <article key={step.n} className="bg-background p-8">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-5xl italic text-primary/30">
                {step.n}
              </span>
              <step.icon
                className="size-5 text-muted-foreground/60"
                strokeWidth={1.4}
              />
            </div>
            <h3 className="mt-8 font-display text-xl text-foreground">
              {step.title}
            </h3>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* -- categorization waterfall ------------------------------------------------ */

const TIERS = [
  {
    label: "Tier 1 · Plaid",
    title: "Bank-grade signals first",
    body: "High-confidence merchant data from Plaid categorizes the obvious ones instantly — flights are Travel, payroll is Income.",
    width: "w-full",
  },
  {
    label: "Tier 2 · Your rules",
    title: "It learns your corrections",
    body: "Fix a merchant once and a rule is written. The same coffee shop never gets miscategorized twice.",
    width: "w-[88%]",
  },
  {
    label: "Tier 3 · Claude",
    title: "An LLM catches the rest",
    body: "Ambiguous or brand-new merchants go to Claude with full context — including transfer and refund pairing across your accounts.",
    width: "w-[76%]",
  },
] as const;

function Waterfall() {
  return (
    <section className="border-y border-hairline bg-card/30">
      <div className="mx-auto grid max-w-6xl gap-14 px-6 py-24 md:py-32 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="space-y-6">
          <SectionKicker>auto-categorization</SectionKicker>
          <h2 className="font-display text-4xl font-normal leading-[1.08] text-foreground md:text-5xl">
            Three tiers deep,{" "}
            <em className="italic text-primary">rarely wrong.</em>
          </h2>
          <p className="max-w-md text-[14px] leading-relaxed text-muted-foreground">
            A categorization waterfall that always commits an answer — it never
            interrupts you with &ldquo;what was this?&rdquo; When it misses,
            your one-line reply becomes the rule that fixes it forever.
          </p>
        </div>

        <div className="space-y-3">
          {TIERS.map((tier, i) => (
            <div
              key={tier.label}
              className={cn(
                "rounded-lg border border-hairline bg-background/80 p-6 backdrop-blur",
                tier.width,
              )}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary/85">
                {tier.label}
              </p>
              <h3 className="mt-2 font-display text-lg text-foreground">
                {tier.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {tier.body}
              </p>
              {i < TIERS.length - 1 ? (
                <span className="sr-only">falls through to</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -- dashboard teaser ---------------------------------------------------------- */

const SPEND_BARS = [34, 58, 41, 72, 49, 88, 63, 45, 79, 56, 92, 68];

const DASH_FEATURES = [
  {
    icon: LineChart,
    title: "Live net worth",
    body: "Assets minus liabilities across every linked account, snapshotted daily.",
  },
  {
    icon: ReceiptText,
    title: "Every transaction, filterable",
    body: "Search, date ranges, category and account filters — all URL-driven and shareable.",
  },
  {
    icon: SplitSquareHorizontal,
    title: "Splits that do math",
    body: "Percent, fixed, or ratio splits — stats always reflect your actual share.",
  },
  {
    icon: Sparkles,
    title: "Realtime, no refresh",
    body: "Swipe a card and watch the dashboard update while the page sits open.",
  },
] as const;

function DashboardTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 md:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
        {/* faux chart card */}
        <div className="order-2 rounded-xl border border-border bg-card/70 p-7 shadow-[0_18px_60px_-28px_oklch(0_0_0/0.5)] lg:order-1">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              spent · this month
            </p>
            <p className="font-display text-2xl italic text-foreground tabular-nums">
              $2,418
            </p>
          </div>
          <div className="mt-7 flex h-32 items-end gap-1.5">
            {SPEND_BARS.map((h, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-t-sm",
                  i === SPEND_BARS.length - 2 ? "bg-primary" : "bg-primary/25",
                )}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              <span className="size-1.5 rounded-full bg-success" />
              net worth +$1,832 this month
            </span>
            <Banknote
              className="size-4 text-muted-foreground/50"
              strokeWidth={1.4}
            />
          </div>
        </div>

        <div className="order-1 space-y-8 lg:order-2">
          <SectionKicker>the dashboard</SectionKicker>
          <h2 className="font-display text-4xl font-normal leading-[1.08] text-foreground md:text-5xl">
            The numbers, when{" "}
            <em className="italic text-primary">you want them.</em>
          </h2>
          <ul className="space-y-5">
            {DASH_FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-card/60">
                  <f.icon
                    className="size-4 text-primary/85"
                    strokeWidth={1.5}
                  />
                </span>
                <div>
                  <h3 className="text-[14px] font-medium text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* -- pricing ------------------------------------------------------------------- */

const INCLUDED = [
  "Unlimited linked accounts via Plaid",
  "WhatsApp notifications on every transaction",
  "Conversational edits — split, recategorize, note, exclude",
  "Receipt photos filed from chat",
  "Full dashboard: net worth, trends, category mix",
  "Three-tier auto-categorization that learns",
];

function Pricing() {
  return (
    <section className="border-t border-hairline bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <SectionKicker className="justify-center">pricing</SectionKicker>
          <h2 className="mt-4 font-display text-4xl font-normal leading-[1.08] text-foreground md:text-5xl">
            Free. <em className="italic text-primary">For now.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Ledger is young and being built in the open. Everything below is
            included while it grows — no card, no trial clock, no surprise
            paywall on your own data.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-lg rounded-xl border border-primary/25 bg-background/80 p-8 shadow-[0_24px_80px_-32px_oklch(0_0_0/0.55)] backdrop-blur md:p-10">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              early ledger
            </p>
            <p className="font-display text-5xl italic text-foreground">
              $0
              <span className="ml-1 align-baseline font-mono text-[11px] not-italic uppercase tracking-[0.18em] text-muted-foreground">
                / mo
              </span>
            </p>
          </div>
          <div className="rule-amber mt-6 w-full opacity-60" />
          <ul className="mt-7 space-y-3.5">
            {INCLUDED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-[13.5px] text-foreground/90"
              >
                <Check
                  className="mt-0.5 size-3.5 shrink-0 text-primary/80"
                  strokeWidth={1.8}
                />
                {item}
              </li>
            ))}
          </ul>
          <Button
            render={<Link href="/signup" />}
            nativeButton={false}
            size="lg"
            className="mt-9 h-11 w-full font-medium tracking-wide"
          >
            Start for free
            <ArrowRight data-icon="inline-end" className="size-4" />
          </Button>
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
            when pricing arrives, early users hear first
          </p>
        </div>
      </div>
    </section>
  );
}

/* -- closing ------------------------------------------------------------------- */

function ClosingCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-28 text-center md:py-36">
      <p className="font-display text-[clamp(2.2rem,5.5vw,3.6rem)] font-normal leading-[1.1] text-foreground">
        The next time your card is swiped,
        <br />
        <em className="italic text-primary">your phone should know.</em>
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Button
          render={<Link href="/signup" />}
          nativeButton={false}
          size="lg"
          className="h-11 px-7 font-medium tracking-wide"
        >
          Open your ledger
        </Button>
        <Button
          render={<Link href="/login" />}
          nativeButton={false}
          variant="outline"
          size="lg"
          className="h-11 px-7"
        >
          Sign in
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <Brand size="sm" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
          built on plaid · twilio · claude — quietly kept ·{" "}
          {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}

/* -- shared -------------------------------------------------------------------- */

function SectionKicker({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.26em] text-primary/85",
        className,
      )}
    >
      <span className="inline-block h-px w-8 bg-primary/50" />
      {children}
    </p>
  );
}
