# Ledger

A personal finance tracker built around one idea: **every bank transaction pings you on WhatsApp within minutes, already categorized — and you reply in plain English to fix it.**

> "this is groceries" · "split 1/3" · "note: reimbursable" · or just attach the receipt photo.

A web dashboard sits on top for stats, net worth, and richer editing.

**Live:** [ledger.mananvyas.com](https://ledger.mananvyas.com)

---

## Why

Existing finance tools do three things badly, and this fixes them:

1. **Real-time notifications.** A WhatsApp message on every posted transaction, with the category already applied — no app to open.
2. **Conversational edits.** Reply to that message in free text to recategorize, split, note, exclude, or attach a receipt. An LLM parses the intent (including combined actions like *"travel and split half"*).
3. **Better auto-categorization.** A three-tier waterfall (Plaid → learned rules → LLM) with proper transfer and refund pairing that learns from your corrections.

## How it works

```
Plaid webhook ─▶ /api/plaid/webhook ─▶ QStash queue ─▶ sync ─▶ categorize ─▶ WhatsApp notify
                                                                   ▲                    │
Twilio inbound ─▶ /api/whatsapp/webhook ─▶ QStash ─▶ parse reply ──┘         reply ◀────┘
```

Webhook handlers store the raw payload, return `200` immediately, and enqueue work to an HTTP job queue. Every background step is an idempotent, signature-verified worker with retries.

## Stack

| Layer | Tech |
|---|---|
| Framework / hosting | Next.js (App Router, React 19) on Vercel |
| Database / auth / realtime / storage | Supabase (Postgres + RLS, Auth, Realtime, Storage) |
| Bank data | Plaid (`transactions/sync`) |
| Messaging | Twilio WhatsApp |
| LLM | Anthropic Claude (categorization + intent parsing) |
| Async queue | Upstash QStash |
| Scheduling | cron-job.org |
| Charts / UI | Recharts · shadcn/ui · Tailwind v4 |
| Observability | Sentry |

## Features

- Plaid bank linking with re-link handling and encrypted (pgcrypto) access tokens
- Three-tier categorization with transfer/refund pairing and rule learning
- WhatsApp notifications + conversational replies (split / recategorize / note / exclude / receipt photo)
- Dashboard: period-aware spend/income/net-flow cards, spending donut, top merchants, 12-month trends, category mix, live net worth
- Transactions list with URL-driven filters (search, dates, categories, accounts, toggles) + infinite scroll
- Per-transaction detail page: split editor, notes, attachments, WhatsApp conversation log, raw Plaid data
- Realtime dashboard updates via Supabase subscriptions

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase / Plaid / Twilio / Anthropic / QStash keys
npm run dev                  # http://localhost:3000
```

Required environment variables are documented in [`docs/01-architecture.md`](docs/01-architecture.md#environment-variables). When `APP_URL` resolves to localhost, queue jobs dispatch inline so the full pipeline works without a public tunnel.

## Documentation

- [`docs/`](docs/) — full spec: overview, architecture, database, backend, categorization, WhatsApp, frontend, and the build plan.
- [`STATUS.md`](STATUS.md) — living build log of what's shipped.

## Notes

Built as a single-developer project; the codebase later grew multi-user (per-user WhatsApp routing, QR-code pairing). It runs on free/hobby tiers across the board (~$3–10/mo, mostly Twilio).
