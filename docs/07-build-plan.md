# 07 — Build plan

The executable plan that ties the other 6 docs together. Reads top-to-bottom; each phase ends in a working, demoable state.

When a task says "see XX-name.md §Y", that section in the spec doc is the source of truth — this plan is the *order* of work, not a re-spec.

---

## Critical path at a glance

```
Phase 0: Scaffold (auth + deploy)
   │
   ▼
Phase 1: Plaid plumbing  ──────────────┐
   │                                    │
   ▼                                    ▼
Phase 2: Categorization        Phase 5: Stats & charts
   │                                    ▲ (can start partway through P2)
   ▼                                    │
Phase 3: WhatsApp out  ─────────────────┤
   │                                    │
   ▼                                    │
Phase 4: WhatsApp in                    │
   │                                    │
   ▼                                    │
Phase 6: Polish ◀───────────────────────┘
```

Dependencies that matter:
- **P1 needs encryption helpers** (P0 task) before `plaid_items` ever stores a token.
- **P1 needs QStash configured** before workers can run.
- **P2 needs P1's `transactions` table** to operate on.
- **P3 needs P2's categorize completion hook** because the WA notification fires at the end of categorize.
- **P4 needs P3's `whatsapp_messages` table and the matched outbound message** to do quote-reply matching.
- **P5 charts can start once P2 has classified data** — don't wait for P3/P4.

---

## Phase 0 — Scaffold

**Goal:** Deployed Next.js app on Vercel with Supabase email/password auth working. Empty dashboard renders.

**Reads from:** [01-architecture.md §Stack, §Environment variables, §Third-party setup](01-architecture.md), [06-frontend.md §File structure](06-frontend.md).

### Tasks

- [ ] **0.1** `npx create-next-app@latest` with TS, app router, Tailwind, ESLint. Initial commit.
- [ ] **0.2** Create Supabase project. Note URL + anon + service-role keys. Enable email auth, **disable** magic link / OAuth providers.
- [ ] **0.3** Create Vercel project, link the repo, deploy a hello-world build.
- [ ] **0.4** Install: `@supabase/supabase-js`, `@supabase/ssr`, `lucide-react`, `tailwind-merge`, `clsx`, `class-variance-authority`, `sonner`, `date-fns`.
- [ ] **0.5** `npx shadcn-ui@latest init`, add primitives we'll need first: `button`, `input`, `label`, `card`, `dialog`, `dropdown-menu`, `sonner`, `popover`, `command`.
- [ ] **0.6** Set env vars in Vercel **and** local `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_PASSPHRASE` (generate via `openssl rand -hex 32`).
- [ ] **0.7** Create `lib/supabase/{client,server,middleware}.ts` per `@supabase/ssr` template (use the official scaffold).
- [ ] **0.8** Root `middleware.ts` calling `updateSession`.
- [ ] **0.9** Pages: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`. Forms call `signInWithPassword` / `signUp`. Redirect to `/` on success.
- [ ] **0.10** `app/(app)/layout.tsx` with auth guard (redirect to `/login` if no session) and a stub sidebar.
- [ ] **0.11** `app/(app)/page.tsx` — empty dashboard placeholder ("Connect your first account").
- [ ] **0.12** Sign up your account on the deployed app. Confirm session cookie + redirect.
- [ ] **0.13** Sentry: install `@sentry/nextjs`, run wizard, set `SENTRY_DSN`. Verify it captures a deliberate error.

### Exit criteria

- Deployed at `<APP_URL>`.
- Sign in / sign up works end to end.
- Authed routes redirect when logged out.
- Empty dashboard renders without errors.
- Sentry receives a test exception.

### Verification

- Open the URL on phone + laptop. Sign in works on both.
- Check Vercel logs for clean function invocations.

---

## Phase 1 — Plaid plumbing

**Goal:** All five banks linked, transactions flowing into the DB via webhook + fallback cron, every payload logged.

**Reads from:** [02-database.md §plaid_items, §accounts, §transactions, §plaid_webhooks](02-database.md); [03-backend.md §Plaid Link, §Webhook receivers, §sync_plaid_item](03-backend.md); [01-architecture.md §Data flow A](01-architecture.md).

### Tasks

- [ ] **1.1** Set up Supabase CLI for local migrations. `supabase init` in repo, `supabase link` to project.
- [ ] **1.2** Migration `0001_extensions_and_helpers.sql`: enable `pgcrypto`, `pg_trgm`, `uuid-ossp`. Create `store_plaid_item()` and `get_plaid_access_token()` SECURITY DEFINER functions.
- [ ] **1.3** Migration `0002_plaid_tables.sql`: create `plaid_items`, `accounts`, `transactions` (just the structural columns — no categorization columns yet), `plaid_webhooks`, `app_events`. Apply RLS policies. Create indexes.
- [ ] **1.4** Apply migrations to dev Supabase project; verify via dashboard.
- [ ] **1.5** Install: `plaid`, `react-plaid-link`. Set Plaid env vars in Vercel + local: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=production`, `APP_URL`.
- [ ] **1.6** `lib/plaid.ts` — typed Plaid client factory.
- [ ] **1.7** `app/api/plaid/link/create-token/route.ts` — auth-gated, calls `linkTokenCreate`. Webhook URL = `${APP_URL}/api/plaid/webhook`.
- [ ] **1.8** `lib/encryption.ts` — wrappers around the SQL functions.
- [ ] **1.9** `app/api/plaid/link/exchange/route.ts` — exchange public token, store via `store_plaid_item`, insert accounts, return new `plaid_item_id`. Enqueue initial sync (placeholder until QStash is wired — for now, call sync inline via internal POST).
- [ ] **1.10** `components/app/plaid-link-button.tsx` wraps `react-plaid-link`. Mounted in `/accounts`.
- [ ] **1.11** `app/(app)/accounts/page.tsx` — list items, accounts, balances; show Plaid Link button.
- [ ] **1.12** Set up Upstash QStash account. Set env vars `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.
- [ ] **1.13** `lib/qstash.ts` — wrapper to publish jobs and verify signatures.
- [ ] **1.14** `app/api/qstash/job/[type]/route.ts` — single dispatcher route that verifies QStash signature and dispatches by `type`. Route table: dispatch to `handlers/sync_plaid_item.ts`, etc.
- [ ] **1.15** `handlers/sync_plaid_item.ts` — load item, decrypt token, paginate `transactionsSync`, upsert transactions (with `raw` jsonb), update `modified` rows, soft-delete `removed` rows, store the **full sync response** as an `app_events` row, update `cursor` and `last_synced_at`. **No categorization yet** — just persist raw data.
- [ ] **1.16** Replace the Phase 1.9 "inline sync" with a QStash publish; verify worker runs.
- [ ] **1.17** `app/api/plaid/webhook/route.ts` — verify Plaid signature (JWKS lookup), insert raw payload to `plaid_webhooks`, dispatch by `webhook_code` to enqueue `sync_plaid_item` for transactions events. Update `plaid_items.status` for ITEM events.
- [ ] **1.18** Configure Plaid dashboard webhook URL.
- [ ] **1.19** `app/api/cron/sync-fallback/route.ts` — verify `Authorization: Bearer ${CRON_SECRET}`, find stale items, enqueue sync jobs.
- [ ] **1.20** Configure cron-job.org for hourly fallback sync.
- [ ] **1.21** `app/(app)/transactions/page.tsx` — basic list of raw transactions (date, account, merchant, amount). No filters yet.
- [ ] **1.22** Connect Amex, Chase, Discover, Robinhood, PayPal in production. Verify webhooks arrive and transactions appear.
- [ ] **1.23** Trigger an Amex test transaction (small purchase or refund), confirm it lands within minutes.

### Exit criteria

- Five banks connected.
- Webhook URL receiving events; every payload visible in `plaid_webhooks`.
- New transactions appear in `/transactions` within ~10 minutes of posting.
- Fallback cron pulls anything missed within an hour.
- No plaintext access tokens anywhere.

### Verification

- Manual sync on a known-good item: count of new rows matches what Plaid dashboard shows.
- Disable a webhook, do a transaction, wait — fallback cron picks it up.
- Inspect a `plaid_webhooks` row: full JSON payload preserved.

---

## Phase 2 — Categorization

**Goal:** Every new transaction is auto-categorized via the waterfall. Transfers paired. Refunds paired (exact-match). Web edits train rules.

**Reads from:** [04-categorization.md (entire)](04-categorization.md); [02-database.md §categories, §category_rules, §transactions categorization columns](02-database.md); [03-backend.md §categorize_transaction, §pair_transfer, §pair_refund](03-backend.md).

### Tasks

- [ ] **2.1** Migration `0003_categorization.sql`: add categorization columns to `transactions` (`plaid_category`, `plaid_confidence`, `ai_category`, `ai_confidence`, `ai_reasoning`, `user_category`, `category_source`, `is_transfer`, `transfer_pair_id`, `is_refund`, `refund_pair_id`, `split_*`, `effective_amount` (generated), `excluded_from_stats`, `last_user_edit_at`, `last_notified_at`, `notified_amount`). Create `categories`, `category_rules`. RLS + indexes.
- [ ] **2.2** Seed default categories via `supabase/seed.sql`. Apply to dev DB.
- [ ] **2.3** `lib/plaid-category-map.ts` — Plaid PFC primary + detail → our 19-category taxonomy.
- [ ] **2.4** `lib/categorize.ts` — `normalizeMerchant`, `applyWaterfall(tx, userCategories, rules)`, plus the `pair_transfer` synchronous helper.
- [ ] **2.5** Install `@anthropic-ai/sdk`. Set `ANTHROPIC_API_KEY`. **Use prompt caching** on the system prompt and the user's category list (which doesn't change per-tx). See [docs](https://docs.anthropic.com/claude-api).
- [ ] **2.6** `lib/anthropic.ts` — typed Haiku call returning structured output. Validate output against category list; fall to "Other" on parse failure.
- [ ] **2.7** `handlers/categorize_transaction.ts` — runs waterfall, persists result, calls `pair_transfer` synchronously, enqueues `pair_refund`.
- [ ] **2.8** `handlers/pair_refund.ts`.
- [ ] **2.9** Wire `sync_plaid_item` to enqueue `categorize_transaction` for each newly-added tx.
- [ ] **2.10** Backfill: one-shot script `scripts/backfill-categorize.ts` that enqueues `categorize_transaction` for all existing un-categorized transactions.
- [ ] **2.11** `app/api/transactions/[id]/route.ts` — PATCH handler. On `user_category` change: upsert `category_rules`, set `category_source='manual'`, `last_user_edit_at`.
- [ ] **2.12** `components/app/category-pill.tsx`, `category-picker.tsx` — used in transactions list.
- [ ] **2.13** Update `/transactions` page to show category pills with inline edit.
- [ ] **2.14** Add a `<SplitDialog>` shell (UI only — submit handler ready) so percent / fixed / ratio splits can be tested via web before WhatsApp lands.

### Exit criteria

- New transactions get a category within seconds of insert.
- Editing a category in the UI persists a `category_rules` row; the next transaction from that merchant uses the rule (verify by comparing two consecutive same-merchant txs).
- Transfers between own accounts auto-pair (verify by triggering a transfer and watching both rows flip to "Transfer").
- Same-merchant exact-amount refund within 30 days auto-pairs.

### Verification

- Health-page-style query: count of `category_source` over the last day. Expect mostly `plaid` + `rule`, some `ai`, no nulls.
- Inspect ai_confidence distribution: average should be > 0.6.

---

## Phase 3 — WhatsApp out

**Goal:** Every new posted transaction pings you via Twilio sandbox WhatsApp within minutes. Pending → posted re-notifies on material change.

**Reads from:** [05-whatsapp.md §Twilio sandbox setup, §Outbound](05-whatsapp.md); [03-backend.md §send_wa_notification](03-backend.md); [04-categorization.md §Pending → Posted re-notification](04-categorization.md).

### Tasks

- [ ] **3.1** Twilio sandbox: join from your phone. Set inbound + status callback URLs to `${APP_URL}/api/whatsapp/webhook`. (Inbound endpoint is built in P4 — for now Twilio just won't get any inbounds we care about.)
- [ ] **3.2** Set env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `USER_WHATSAPP_TO`.
- [ ] **3.3** Migration `0004_whatsapp.sql`: create `whatsapp_messages` table, RLS, indexes.
- [ ] **3.4** `lib/twilio.ts` — wrapper for `messages.create`. Sandbox sends free-form `body`.
- [ ] **3.5** `handlers/send_wa_notification.ts` — load tx, skip if `is_transfer=true`, format body for variant `new` or `re-notify`, send, log to `whatsapp_messages`, update `last_notified_at` + `notified_amount`. Throw on Twilio failure (let QStash retry).
- [ ] **3.6** Wire `send_wa_notification` enqueue at the end of `categorize_transaction` (only when `is_transfer = false` after pairing).
- [ ] **3.7** In `sync_plaid_item`, detect pending→posted transitions; if amount Δ > 5% OR category changed since last notification, enqueue `send_wa_notification` with `variant='re-notify'`.
- [ ] **3.8** Status callback handling: Twilio posts `MessageStatus` updates to the same webhook URL; route by presence of `MessageSid` in body but no `Body` → status update, update `whatsapp_messages.status`.
- [ ] **3.9** Test: make a real swipe on Amex; expect a WhatsApp message within ~5 minutes.
- [ ] **3.10** Test: re-notify path. Find a recently-pending transaction, wait for it to post; if amount changed >5%, expect a 🔄 update message.

### Exit criteria

- Live transaction → WhatsApp ping with amount, merchant, guessed category.
- Transfers don't ping.
- Material pending→posted changes re-notify.
- All sent messages logged to `whatsapp_messages`.

### Verification

- Query `whatsapp_messages` after a day of usage: `direction='outbound'` count ≈ count of new non-transfer transactions. No "failed" status.
- Check delivery latency: `whatsapp_messages.created_at - transactions.date` median < 15 minutes.

---

## Phase 4 — WhatsApp in

**Goal:** Replying to a notification edits the transaction. All five intents work. Photo attachments saved.

**Reads from:** [05-whatsapp.md §Inbound, §Receipt photos, §Edge cases](05-whatsapp.md); [03-backend.md §parse_wa_reply](03-backend.md); [02-database.md §transaction_attachments](02-database.md).

### Tasks

- [ ] **4.1** Migration `0005_attachments.sql`: create `transaction_attachments`, RLS, indexes.
- [ ] **4.2** Supabase Storage: create private bucket `receipts`. Add storage policies for `auth.uid()`-scoped read/write.
- [ ] **4.3** `app/api/whatsapp/webhook/route.ts` — verify `X-Twilio-Signature`, persist inbound `whatsapp_messages` row, distinguish status-callback vs new-message via fields, enqueue `parse_wa_reply` for new messages. Return TwiML `<Response/>`.
- [ ] **4.4** `lib/intent.ts` — Claude Haiku call with the system + user prompts from 05-whatsapp.md. Returns typed `Intent`. Validates `new_category` against user's category list.
- [ ] **4.5** `handlers/parse_wa_reply.ts`:
  - Resolve target tx (quoted → recent → ask).
  - Download media (if any) via Twilio HTTP basic auth, upload to Storage, insert `transaction_attachments`.
  - Parse text body via `lib/intent.ts` (skip if body empty).
  - Apply intent: update `transactions`, upsert `category_rules` if recategorize.
  - Send confirmation via Twilio (free-form, inside 24h window).
  - Update inbound `whatsapp_messages` with `intent` + `parsed_payload` + `related_transaction_id`.
- [ ] **4.6** Test cases (live, with a couple of fresh transactions):
  - Reply (no quote): "this is groceries" → recategorized; rule saved.
  - Quote + reply: "split 1/3" → split_type=ratio, split_value=0.3333, effective_amount = amount/3.
  - Reply: "20%" with quoted tx → split_type=percent.
  - Reply: "$8" with quoted tx → split_type=fixed.
  - Reply: "ignore this" → excluded_from_stats=true.
  - Reply with photo (no text) → attachment saved, ack message.
  - Stray "lol" with no recent tx → "Which transaction?" reply.

### Exit criteria

- Every intent works end-to-end.
- Photos persist to Storage and appear in transaction detail page.
- Reply matching never silently edits the wrong transaction (verify with a deliberate ambiguous reply — should ask).
- Categorization rules learn from WA edits the same way they learn from web edits.

### Verification

- After a week: check `whatsapp_messages.intent` mix. Mostly `recategorize` + `split` + `note`. `unknown` rate should be < 10%.

---

## Phase 5 — Stats & charts

**Goal:** Dashboard answers "how much on X this month, what's my net worth trend." Realtime updates as transactions land.

**Reads from:** [06-frontend.md §/, §/transactions, §Realtime usage](06-frontend.md); [02-database.md §Views](02-database.md); [03-backend.md §Stats](03-backend.md).

### Tasks

- [ ] **5.1** Migration `0006_stats.sql`: create `balance_snapshots`, `v_spending`, `v_net_worth_daily`. RLS on the table.
- [ ] **5.2** `handlers/snapshot_balances.ts` — for each active item, decrypt token, call `accountsBalanceGet`, upsert snapshot rows.
- [ ] **5.3** `app/api/cron/snapshot-balances/route.ts` — auth via CRON_SECRET, enqueue snapshot job.
- [ ] **5.4** Configure cron-job.org daily 03:00 → `${APP_URL}/api/cron/snapshot-balances`.
- [ ] **5.5** Backfill: run snapshot once for today to seed the chart.
- [ ] **5.6** `app/api/stats/{spending,net-worth,category-mix}/route.ts` — implement the three stats endpoints.
- [ ] **5.7** Dashboard charts: `<SpendingByCategory>` (donut), `<SpendingOverTime>` (bar), `<NetWorthChart>` (line). All Recharts. Server-fetched data; client component for interactivity.
- [ ] **5.8** Dashboard "Spent this month" + "Net worth" header cards.
- [ ] **5.9** `<RealtimeListener>` on `(app)/layout.tsx` subscribed to `transactions` and `accounts` for the user. On insert/update, invalidate dashboard data.
- [ ] **5.10** Transactions page: filters (date range, category, account, search, toggles), URL-driven state.
- [ ] **5.11** Empty states: dashboard with no banks, transactions with empty filter result.

### Exit criteria

- Dashboard charts populate from real data.
- Net worth chart has a daily line.
- Filters on `/transactions` work and shareable via URL.
- Realtime: a new transaction appears on the dashboard within seconds without manual refresh.

### Verification

- Check `v_spending` matches what the donut sums to.
- Manually verify net worth calculation against your actual balances on a given day.

---

## Phase 6 — Polish

**Goal:** Edges sanded. Operational visibility. Quality-of-life features.

**Reads from:** [06-frontend.md §/admin/health, §/categories](06-frontend.md); [01-architecture.md §Observability](01-architecture.md).

### Tasks (do as needed; not all are blocking)

- [ ] **6.1** `/admin/health` page (gated to your user_id) per the spec.
- [ ] **6.2** Category management page: rename, recolor, reorder, merge.
- [ ] **6.3** Manual transaction creation (cash, etc.).
- [ ] **6.4** Bulk edit on `/transactions`.
- [ ] **6.5** CSV / JSON export.
- [ ] **6.6** Refund pairing UI: manually link two existing transactions as a refund pair.
- [ ] **6.7** "Show raw Plaid data" collapsible on transaction detail.
- [ ] **6.8** WhatsApp conversation log on transaction detail.
- [ ] **6.9** Recurring-transaction detection (Plaid `transactionsRecurringGet`) — surface "you spent $X on subscriptions."

### Exit criteria

Subjective — phase 6 is open-ended.

---

## Cross-phase notes

- **Run migrations through Supabase MCP** during dev. After each migration: regenerate TypeScript types via `supabase gen types typescript --project-id <id>` and commit.
- **Every new env var goes in 3 places**: local `.env.local`, Vercel project settings, and the env-var list in [01-architecture.md](01-architecture.md).
- **Never delete a webhook payload row.** `plaid_webhooks` and `whatsapp_messages` are append-only audit logs. If you need to reprocess, set `processed=false` and re-enqueue.
- **One commit per task** (or close to it). Easier to roll back, easier to skim history.
- **Update [STATUS.md](../STATUS.md) at the end of every working session.** What's done, what's next, what's blocked.

---

## Estimating

Rough first-pass time estimates (focused work, single developer):

| Phase | Estimate |
|---|---|
| 0 — Scaffold | half a day |
| 1 — Plaid plumbing | 2-3 days |
| 2 — Categorization | 2 days |
| 3 — WhatsApp out | 1 day |
| 4 — WhatsApp in | 2 days |
| 5 — Stats & charts | 1-2 days |
| 6 — Polish | open-ended |

Total to a usable v1 (P0–P5): **~9-11 days of focused work**, more calendar time depending on how concentrated the sessions are.
