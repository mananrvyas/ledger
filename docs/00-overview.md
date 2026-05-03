# 00 — Overview

A personal finance tool for one user (you), focused on three things existing tools do badly:

1. **Real-time WhatsApp notifications** with auto-applied category — every transaction pings you within minutes of posting.
2. **Conversational edits** — reply to the WhatsApp message in free text to recategorize, split, note, or exclude.
3. **Better auto-categorization** with proper transfer detection and learning from corrections.

A web dashboard sits on top for stats, net worth, and richer editing.

---

## Scope

**In scope (MVP):**
- Plaid bank linking (Limited Production, up to 5 items)
- Transaction sync via Plaid webhooks + fallback cron
- Three-tier categorization waterfall (Plaid → learned rules → LLM)
- Transfer pairing across accounts
- Same-merchant refund pairing (exact-amount, 30-day window)
- WhatsApp notification on every new posted transaction (Twilio sandbox)
- WhatsApp reply parsing for: split (percent / fixed / ratio), recategorize, note, exclude, photo attach
- Receipt photos from WhatsApp → Supabase Storage
- Dashboard: month spend, category breakdown, spend over time, net worth chart
- Realtime updates on dashboard and transactions list
- Daily balance snapshots (cron-job.org)
- Queue-based async processing (Upstash QStash) with retries
- Email/password auth via Supabase

**Out of scope (for now):**
- Multi-user
- Multi-currency / FX
- Manual cash transactions (phase 6 candidate)
- Recurring-transaction detection (phase 6 candidate)
- Investment-position tracking beyond cash flows
- Budgets / goals / alerts
- Mobile app
- Receipts OCR (just store the photo for now)
- Auto-pairing refunds when amounts differ

---

## Frozen decisions

| Decision | Choice | Why |
|---|---|---|
| Frontend / hosting | Next.js 15+ on Vercel | Free tier, your preference |
| DB / auth / realtime | Supabase | Bundled, generous free tier, pgcrypto built in |
| Auth method | Email + password | Simplest; one user |
| Bank data | Plaid (Limited Production) | Already approved; covers all 5 banks |
| LLM | Claude Haiku via Anthropic API | Cheap, fast, good at structured output |
| Messaging | Twilio WhatsApp sandbox | Works indefinitely for one user, no template approval friction |
| Scheduled jobs | cron-job.org | Free, multiple crons, signed endpoints |
| Async / queue | Upstash QStash | HTTP-based, free 500 msg/day, no infra |
| Charts | Recharts | Mature, matches stack |
| UI primitives | shadcn/ui + Tailwind v4 | Fast, good defaults |
| Storage of raw data | Keep everything | Store full Plaid payloads + raw transaction blobs for future analysis |
| Categorization policy | Always guess, never block to ask | User corrects via WhatsApp |
| Re-notify on pending→posted | Only when amount Δ > 5% or category changed | Quiet otherwise |
| Refund auto-pair | Same merchant + exact amount within 30 days only | Else surface as standalone |
| Splits | Support percent, fixed amount, ratio (1/3, 1/10) | Store raw input + computed effective amount |

---

## Phasing

Each phase is independently usable.

### Phase 0 — Scaffold
Next.js project, Supabase project, Vercel deploy, env vars, email/password auth working, empty dashboard renders.
**Exit:** can sign in, see empty dashboard, no errors.

### Phase 1 — Plaid plumbing
Plaid Link, encrypted token storage, initial historical sync, raw transactions list page (no categories yet), webhook handler stores all events to `plaid_webhooks`.
**Exit:** all 5 banks connected, transactions visible, webhook stores payloads.

### Phase 2 — Categorization
Default categories, waterfall, rules table, transfer pairing, refund pairing, pending→posted re-notify rule, edit-in-UI persists rule.
**Exit:** new transactions get a sensible category automatically; correcting one trains the rule.

### Phase 3 — WhatsApp out
Twilio sandbox set up, outbound utility-template-style message on every new posted tx, all messages logged to `whatsapp_messages`.
**Exit:** swiping a card pings you within ~minutes.

### Phase 4 — WhatsApp in
Inbound webhook, LLM intent parser, reply matching (quoted → recent → ask), all 5 intents (split, recategorize, note, exclude, photo) wired, confirmation message.
**Exit:** replying "split 1/3" or "this is groceries" or attaching a photo all work end to end.

### Phase 5 — Stats & charts
Dashboard charts, daily balance snapshots cron, net worth chart, transaction filters and search.
**Exit:** dashboard answers "how much did I spend on X this month?" instantly.

### Phase 6 — Polish
Health page, manual transactions, refinements based on actual usage.

---

## Cost estimate

| Service | Tier | Monthly |
|---|---|---|
| Vercel | Hobby | $0 |
| Supabase | Free | $0 |
| Plaid | Limited Production | $0 (5-item cap) |
| Twilio | Sandbox + outbound utility messages | ~$3–8 |
| Upstash QStash | Free (500/day) | $0 |
| cron-job.org | Free | $0 |
| Anthropic (Claude Haiku) | Pay-as-you-go | <$1 |
| Sentry | Free | $0 |
| **Total** | | **~$3–10/mo** |

---

## Open questions / things to verify during build

1. Plaid pending-transaction coverage on Robinhood and PayPal — expect lag, not real-time. Surface in UI as a per-account expectation.
2. Twilio sandbox session: confirm "join {keyword}" once, no expiry. Verify if session ever needs refreshing.
3. Supabase Realtime + RLS: confirm subscription only fires for authenticated user's rows.
4. QStash free tier (500 msg/day) — is comfortable for ~50 transactions/day plus retries.
5. Confirm Plaid `personal_finance_category.confidence_level` values are the only ones we use ("VERY_HIGH" / "HIGH"); document fallback if Plaid changes the schema.
6. If a 6th bank is needed later, full Plaid Production approval is required — note for future.

---

## Glossary

- **Item** (Plaid term): one connection to one institution (e.g., one Amex login). May contain multiple accounts.
- **Account**: a single financial account inside an item (e.g., Amex Gold card, Chase checking).
- **Cursor** (Plaid term): position marker for `transactionsSync` — opaque string that tells Plaid where to resume.
- **Waterfall**: ordered fallback strategy for categorization (Plaid → rules → LLM).
- **Transfer pair**: two transactions on different accounts that net to ~zero — money moving between your own accounts.
