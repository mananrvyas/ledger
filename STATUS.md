# Status

Living tracker. Updated at the end of every working session. Source of truth for "where are we right now."

For the executable plan, see [docs/07-build-plan.md](docs/07-build-plan.md).
For the spec, see [docs/00-overview.md](docs/00-overview.md) and the rest.

---

## Current phase

**Phase 6 dashboards + filters + detail page shipped.** Dashboard now period-aware (URL-driven `this_month` / `last_month` / `3m` / `6m` / `ytd` / `12m` / `all`). Three top-row cards (Spent / Income / Net cash flow) with prior-period deltas + pace-projection footnote on this_month. Two new lists (Top merchants with sparklines, Largest transactions) sit under the donut. Two new charts: 12-month spend bars + 12-month net-cash-flow bars (color flips emerald/rose by saving/burning month), and a 6-month stacked area showing category mix over time with category-color-resolved layers. `/transactions` now has a full filter bar (search, date range, categories multi-select, accounts multi-select, pending-only / hide-transfers / hide-excluded / with-attachment toggles) — all URL-driven so back-button + sharing work. Donut slices and top-merchants rows link into pre-filtered `/transactions`. New `/transactions/[id]` detail page: hero (date kicker, merchant title, amount), edit panel (split tabs with live preview, notes textarea, exclude toggle — all server actions), attachments grid with signed URLs (Phase 4 photos finally viewable), facts list, WhatsApp conversation log, and collapsible raw Plaid jsonb. All transaction rows clickable into detail.

Phase 5 dashboard fully operational underneath. Plaid Production live · multi-user infrastructure shipped + re-link unbroken. Twilio WhatsApp prod is still parked.

---

## Done

- 2026-05-03 — Planning docs (7 files in `docs/` + this tracker)
- 2026-05-03 — **Phase 0**:
  - Next.js 16.2.4 / React 19 / TS / Tailwind v4 / App Router scaffolded
  - shadcn/ui (button, card, input, label, sonner) + lucide-react + sonner + date-fns
  - Supabase SSR client (`lib/supabase/{client,server,middleware}.ts`), `proxy.ts` at root for session refresh + auth guard
  - Email/password `/login` and `/signup` with server actions
  - `(app)` layout with auth guard, header nav (Dashboard / Transactions / Accounts / Settings), sign-out
  - Empty dashboard placeholder card
  - `.env.local` populated for known secrets; placeholders for `SUPABASE_SERVICE_ROLE_KEY` and `USER_WHATSAPP_TO`
  - Vercel project linked: `redacted-team/finance-planning`, GitHub auto-connected
  - Production env vars uploaded to Vercel (16 vars, all 3 environments)
  - First production deploy (per-build URL): `finance-planning-9fk8vrdvq-...vercel.app`. Stable production alias is <https://finance-planning-nu.vercel.app>
  - GitHub repo: <https://github.com/mananrvyas/finance-planning> (private)
  - **Sentry** wired (`@sentry/nextjs` SDK, server/edge/client configs, instrumentation, `/sentry-example-page` for capture testing). `sendDefaultPii: false` set everywhere to honor the no-financial-data-in-logs policy.
  - `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` filled in `.env.local` and pushed to Vercel for prod/preview/dev.
- 2026-05-03 — **Design system** (Quiet Ledger): warm-dark editorial. Fraunces (display) + Geist Sans + Geist Mono. Single amber accent. Atmospheric backdrop on auth, tabular-nums + ledger ruling on dashboard. Reusable Brand component.
- 2026-05-03 — **Phase 1 (code complete)**:
  - Schema migrations 0001-0003 applied via Supabase MCP: pg_trgm, core tables (`plaid_items`, `accounts`, `transactions`, `plaid_webhooks`, `app_events`) with RLS, encryption helpers (`store_plaid_item` / `get_plaid_access_token`).
  - TypeScript types generated to `lib/database.types.ts`. SSR + browser Supabase clients now typed; `lib/supabase/admin.ts` is the service-role escape hatch.
  - Libraries: `lib/plaid.ts` (Plaid SDK factory), `lib/encryption.ts` (RPC wrappers), `lib/qstash.ts` (publish + verify), `lib/format.ts` (currency / date helpers).
  - API routes: `/api/plaid/link/{create-token,exchange}`, `/api/plaid/webhook`, `/api/qstash/job/[type]`, `/api/cron/sync-fallback`.
  - Worker: `handlers/sync_plaid_item.ts` — cursor-based `transactionsSync`, idempotent upsert/update/soft-delete, audit row in `app_events`.
  - Components: `components/plaid/plaid-link-button.tsx` (with reconnect mode).
  - Pages: `/accounts` (institutions + balances), `/transactions` (raw list with pending pill + credit highlight).
  - Vercel `NEXT_PUBLIC_APP_URL` / `APP_URL` updated to canonical production URL `https://finance-planning-nu.vercel.app`.
- 2026-05-03 — **Phase 2** (categorization):
  - Migrations 0004 (categorization columns + categories + category_rules tables, RLS, generated `effective_amount` STORED column) and 0005 (19 default categories seed) applied via Supabase MCP. TypeScript types regenerated.
  - `lib/plaid-category-map.ts` — Plaid PFC → our 19-category taxonomy with detail-level overrides.
  - `lib/anthropic.ts` — Claude Haiku 4.5 client + `callClaudeWithSchema` helper using `messages.parse` + `zodOutputFormat` + `cache_control` on system prompt.
  - `lib/categorize.ts` — three-tier waterfall (Plaid → rules → Claude), `pairTransferIfMatch` (synchronous), `upsertCategoryRule`, batch classifier.
  - `handlers/categorize_transaction.ts` + `handlers/pair_refund.ts` — idempotent QStash workers.
  - `sync_plaid_item` now captures Plaid's category fields and enqueues `categorize_transaction` per new tx.
  - `/api/qstash/job/[type]` routes the new job types.
  - `/api/admin/backfill-categorize` (auth-gated) — one-shot enqueue for existing rows; `?force=true` to overwrite.
  - `/api/transactions/[id]` PATCH — RLS-bound edit; upserts `category_rules` on category change.
  - `components/app/category-pill.tsx` + `components/app/category-picker.tsx` — Base UI Popover + cmdk Command; toast + `router.refresh()` after PATCH.
  - `/transactions` page: 5-col grid with inline category picker, pending / transfer / refund / split indicators, dimmed row when excluded.
  - shadcn primitives added: popover, command, dialog, textarea, input-group.
  - **Recategorize button** on `/transactions` (`components/app/recategorize-all-button.tsx`): plain click runs missing-only backfill; Shift-click force-recategorizes everything (with confirm).
  - **Source tag** (`components/app/source-tag.tsx`) inline next to each category pill on `/transactions`: P (plaid, emerald) · R (rule, sky) · AI (primary amber) · M (manual). Tooltip on hover names the source. Legend in the footer of the page.
- 2026-05-03 — **Phase 3** (WhatsApp out — code):
  - Migration 0006 (`whatsapp_messages` table — both directions, RLS owner-select, audit-log style append-only). Types regenerated.
  - `lib/twilio.ts` — Twilio SDK singleton + sandbox-aware `sendWhatsAppMessage`.
  - `handlers/send_wa_notification.ts` — formats the body for `'new'` vs `'re-notify'` variants, inserts a pending `whatsapp_messages` row, calls Twilio, updates the row with the SID + status, stamps `transactions.last_notified_at` + `notified_amount` for the >5% re-notify rule.
  - `categorize_transaction` enqueues `send_wa_notification` at the end for non-transfer transactions.
  - `sync_plaid_item` now reads previous transaction state on `modified`, computes `was_pending && now_posted && |Δamount| / baseline > 5%`, and enqueues `send_wa_notification` with `variant='re-notify'` when material.
  - QStash dispatcher routes `send_wa_notification`.
  - Twilio SDK installed.
  - **Verified end-to-end** in production (`finance-planning-nu.vercel.app`): the test-WA button on `/transactions` enqueues a job, the worker formats + sends, the message lands on the user's phone within seconds. Local dev was 500ing because QStash refuses to publish to localhost; fixed by adding inline-dispatch in `lib/qstash.ts` when `APP_URL` resolves to loopback.
  - Admin endpoint `/api/admin/test-wa-notification` + `<TestWhatsAppButton />` — picks the user's most recent non-transfer transaction (or one passed by ID), clears `last_notified_at` so the worker doesn't skip, and enqueues with a unique idempotency key. One-shot test path that doesn't flood the inbox.
- 2026-05-03 — **Phase 4** (WhatsApp inbound — code):
  - Migration 0007 (`transaction_attachments` table with FK to `transactions`, RLS owner-policy, `source` check constraint for `whatsapp|web_upload`; private `receipts` Storage bucket; storage policies keyed on first path segment = `auth.uid()`). Types regenerated.
  - `lib/intent.ts` — Zod-typed discriminated-union schema for the 6 intents (`recategorize`, `split`, `note`, `exclude`, `include`, `unknown`) + Claude Haiku 4.5 prompt + `parseWhatsAppIntent` helper. Defense-in-depth: if Claude returns a `new_category` not in the user's list, coerce to "Other".
  - `handlers/parse_wa_reply.ts` — full pipeline:
    1. Idempotency: skip if `intent IS NOT NULL` (handles QStash double-delivery).
    2. Match transaction: quoted reply (`OriginalRepliedMessageSid` → outbound row's `related_transaction_id`) → recent un-edited within 60min → ask "which transaction?" and exit.
    3. For each Twilio media URL: HTTP basic auth download, validate MIME (image/* or application/pdf), validate size (<10MB), upload to `receipts/{user_id}/{tx_id}/{uuid}.{ext}`, insert `transaction_attachments` row.
    4. Run intent parser on text body (skip if empty + media present → treat as note).
    5. Apply intent: PATCH transactions, upsert `category_rules` for recategorize.
    6. Send Twilio confirmation via `sendAndLog` helper (logs every outbound, including the clarifier).
    7. Stamp inbound row with `intent` + `parsed_payload` (jsonb of the typed Intent) + `related_transaction_id`.
  - `app/api/whatsapp/webhook/route.ts` — single endpoint serving both inbound messages AND Twilio status callbacks. **HMAC-SHA1 signature verification** via `twilio.validateRequest` (the SDK helper handles the URL+sorted-params byte sequence exactly). Status callbacks update outbound row's `status`. Inbound messages insert + enqueue `parse_wa_reply`. Always returns 200/empty TwiML on logical failures so Twilio doesn't retry. Idempotent on `twilio_message_sid` for inbound dedup.
  - QStash dispatcher (`/api/qstash/job/[type]`) routes `parse_wa_reply`. `lib/qstash.ts` inline-dispatch handles it locally too.
  - **Verified end-to-end** in production: photo-only reply attached as `image/jpeg` (496 KB) to `receipts/{user_id}/{tx_id}/{uuid}.jpg`, `transaction_attachments` row written with `source='whatsapp'`. Quoted-reply "split half and half" applied `split_type=ratio, split_value=0.5`, `effective_amount` recomputed to $250 via the generated column.
- 2026-05-04 — **Phase 4 — post-launch fixes** (commit `426824f`):
  - **Multi-action replies.** `lib/intent.ts` schema is now a single `Action` object with optional `recategorize`/`split`/`note`/`exclude_set`/`unclear` fields, instead of a discriminated single-intent union. Prompt explicitly allows combinations: "categorize as travel and split half" applies BOTH in one DB update + stitched confirmation. `whatsapp_messages.intent` is now a compound label like `recategorize+split`, with the structured `Action` in `parsed_payload.action`.
  - **Latest-notified matching.** No-quote replies now resolve to the SINGLE most-recent outbound `tx_notification`'s `related_transaction_id` within 60 min. Dropped the "exactly one candidate" + "last_user_edit_at IS NULL" gates that were making "🤔 Which transaction?" fire when the user clearly meant the last ping. Quoted replies still take precedence.
  - **Photo-only reply copy.** No more fake `note` intent. Sends `📎 Photo attached to {merchant} ${amount}.` and leaves the `notes` column alone. (Photos with text alongside still apply both: image saved + text intents executed + stitched confirmation.)
- 2026-05-04 — **Phase 5** (stats & charts):
  - Migration 0008: `balance_snapshots` table (RLS owner-select, unique on `(account_id, date)`). Two `security_invoker` views — `v_spending` (single-source-of-truth filter for "outflows": pending/transfer/refund/excluded all stripped, plus `Income/Transfer/Refund` categories excluded) and `v_net_worth_daily` (assets minus liabilities by account type per user per day). Types regenerated.
  - `handlers/snapshot_balances.ts` — per-item Plaid `accountsBalanceGet` → updates `accounts.{current,available}_balance` → upserts a `balance_snapshots` row keyed `(account_id, today)`. Idempotent.
  - `app/api/cron/snapshot-balances/route.ts` — `CRON_SECRET`-gated GET, fans out one QStash job per active item.
  - QStash dispatcher + `lib/qstash.ts` inline-dispatch both route `snapshot_balances`.
  - **Initial seed**: ran a one-off SQL upsert of today's snapshots from `accounts.current_balance` so the Net Worth chart has at least one data point on day-zero render. Cron will keep filling forward.
  - `recharts` 3.8 installed.
  - Three Recharts client components: `<SpendingDonut>` (donut + center total + 6-slice legend with "+ N more" tail), `<SpendingBars>` (daily bars for current month, day-of-month X axis), `<NetWorthLine>` (area chart with amber gradient, 90-day window, compact `$Xk` ticks). All use `var(--chart-1..5)` tokens so they pick up the warm-dark palette.
  - `<StatCard>` — top-row card with kicker, big italic Fraunces value, color-aware delta pill (good = emerald, bad = rose, neutral = muted), footnote.
  - Dashboard rebuild (`app/(app)/page.tsx`): server component does parallel `Promise.all` over `v_spending` (last + this month), `v_net_worth_daily` (last 90d), recent transactions, categories. Aggregates by category and by date in JS. Renders empty state if no accounts. Uses `force-dynamic`.
  - `<RealtimeListener>` mounted in `(app)/layout.tsx`: subscribes to `transactions` and `accounts` Postgres changes filtered by `user_id`, debounces 400ms, calls `router.refresh()` so server pages re-fetch without a hard reload.
- 2026-05-08 — **Phase 6** (dashboards · filters · detail page):
  - **Period system** (`lib/period.ts`): URL-driven, parses `?period=this_month|last_month|3m|6m|ytd|12m|all` or explicit `?from&to` for custom. Resolves to `{from, to, prior, label, days, isCustom}` with prior-window calculation that's same-day-of-month for monthly windows and same-length-shifted-back for arbitrary ranges. `<PeriodSelector/>` is a pill row in the dashboard header that pushes URL state via `router.replace` (no history entry per click). All period-aware cards/charts/lists read from the same resolver.
  - **3-card stat row**: Spent / Income / Net cash flow. Income comes from `transactions` directly (not `v_spending`, which filters Income out by design); summed via negation since Plaid convention is `amount < 0` for inflows. Net flow = income − spent (positive = saving, emerald; negative = burning, rose). Pace-projection footnote on the Spent card when `period.key === 'this_month'`: `(spentTotal / dayOfMonth) × daysInMonth`. All three cards share the same prior-window comparator, with colors that interpret the delta direction differently per card (more-spend = bad, more-income = good, bigger-savings = good).
  - **Top merchants** + **Largest transactions** (`components/app/dashboard/{top-merchants,largest-transactions}.tsx`): aggregated from the same period-windowed `v_spending` rows, no extra queries. Each top-merchant row gets a 6-bucket inline SVG sparkline showing how spend on that merchant trended within the period (suppressed when period is too short or merchant has < 2 rows). Both lists link into `/transactions?q=...` or `/transactions/{id}`.
  - **Monthly trend bars** (`charts/monthly-trend-bars.tsx`): always 12 months ending in the current month, ignoring period selector (it IS the trend). Two modes: `mode='spent'` shows total monthly spend with the most-recent month dimmed (in-progress); `mode='net'` shows net cash flow with bars flipping emerald (saving) or rose (burning). Dashboard renders both side-by-side.
  - **Category stacked area** (`charts/category-trend-area.tsx`): always last 6 months. Picks top 5 categories by total spend over the window; everything else folded into "Other" (which is one of the 19 default categories with its own color, so it renders cleanly). Stack order puts smallest series at the bottom and "Other" on top so categories of interest anchor the X-axis. Tooltip shows month total + non-zero categories sorted desc.
  - **Single big spending fetch** for the dashboard: `[max(prior.from, 12moStart) .. today]` — covers period, prior, and 12-month trend in one round-trip. Same trick for income. Period filtering happens in JS over the same row buffer.
  - **`/transactions` filter bar** (`components/app/transactions/filter-bar.tsx`): URL-driven multi-popover toolbar. Search (debounced 320ms via `ilike` over `merchant_name` OR `name`), date range (two `<input type="date">`), categories multi-select with checkboxes, accounts multi-select, plus four narrowing toggles (`pendingOnly`, `hideTransfers`, `hideExcluded`, `withAttachment`). Defaults are show-all; each filter narrows. The page passes the URL search string to `<TransactionsList/>` as `apiQueryString` so `/api/transactions` paginates over the same set; the list is keyed on a stable `filterSignature(filters)` so React re-mounts (and resets infinite-scroll state) when filters change. The `withAttachment` toggle is implemented as a pre-fetch into `transaction_attachments` returning the `transaction_id` set, then `.in("id", ids)` on the main query — two queries instead of an embedded join, but keeps the count() math correct.
  - **`/transactions/[id]` detail page**: hero (date kicker, merchant title, amount), category picker + source tag + test-WA button, two-column body. Left column: edit panel (split tabs with input + live "your share" preview + save/remove via server actions; notes textarea with dirty-check save; exclude toggle slider — all `revalidatePath` on success), then attachments grid. Right column: facts list (Plaid category + confidence, AI guess + reasoning, last WA ping + amount, last edit, transfer/refund pair link), WhatsApp conversation log (chat bubbles with status + intent labels), collapsible raw Plaid jsonb pre-block.
  - **Attachments grid** (`components/app/transactions/attachment-grid.tsx`): server component that signs paths with the admin client (1-hour TTL). Image MIMEs render as 1:1 thumbnails (cover, click-to-open in new tab); other MIMEs fall back to a file-icon tile with mime + size label. The bucket policies still gate access at upload time; signing skips RLS but the URL is then user-presented.
  - **Conversation log** (`components/app/transactions/conversation-log.tsx`): inbound on the right (user voice), outbound on the left (we sent it). Status pill on outbound rows (rose if `failed`); intent label on inbound rows (`recategorize+split` etc.). Relative timestamps with day/hour/minute resolution.
  - **Click-throughs everywhere**: dashboard recent-activity rows → detail. Largest-transactions rows → detail. Top-merchants rows → `/transactions?q={merchant}`. Donut legend → `/transactions?categories={cat}`. All `/transactions` rows → detail (every column is a `<Link/>` except the inline category picker which preserves its existing PATCH flow).
  - Items deferred from this push (not blocking): day-of-week heatmap (low actionable value), `/admin/health`, Plaid recurring detection (separate paid product), category management UI, manual cash entry, CSV export, Plaid webhook signature verification.
- 2026-05-04 — **Plaid post-launch fixes** (Production cutover):
  - **Migration 0009**: `accounts.plaid_account_id` unique constraint demoted to partial unique index `WHERE is_archived = false`. Old strict constraint blocked re-linking the same bank because Plaid reuses the same `account_id` across re-links. Now archived rows can coexist with active replacements forever.
  - **`days_requested: 730`** added to `linkTokenCreate`. Plaid was defaulting to 90 days of history, which is why the initial Chase + Robinhood imports only spanned Feb–May. New links request the full 24-month window banks expose. Existing items must be re-linked to get the deeper history.
  - **`processed=true` cosmetic fix** in `/api/plaid/webhook` — the audit row now flips after dispatch so `plaid_webhooks` doesn't look like a graveyard.
  - **Fix A: state carry-over on Plaid pending→posted re-id.** `handlers/sync_plaid_item.ts` now detects when Plaid replaces a row (different `plaid_transaction_id`) and copies `excluded_from_stats`, `split_*`, `notes`, `last_user_edit_at`, `last_notified_at`, `notified_amount` from the soft-deleted predecessor onto the replacement. Match is by same account + same merchant_pattern + amount within ±5% + date within ±7 days. Inheriting `last_notified_at` also makes `send_wa_notification` skip the duplicate ping automatically (no extra gate needed).
  - **60-min initial-backfill silence** in `handlers/categorize_transaction.ts` — when a fresh Plaid item is linked, the 24-month history backfill replays through categorize → send_wa_notification and would fire ~20-60 WA messages. New gate: skip enqueueing WA when the parent `plaid_items.created_at` is < 60 min ago. Real-time tx after the backfill window pings normally.
- 2026-05-04 — **Infinite scroll on `/transactions`**:
  - `app/api/transactions/route.ts` — auth-gated GET with `?offset&limit`, RLS-scoped, returns `{rows, total}`.
  - `components/app/transactions/transactions-list.tsx` — client component that holds rows in state, fires the API via IntersectionObserver (400px-rootMargin sentinel), de-dupes by id on append, shows a status footer (`scroll for more · X of Y` / `loading more` / `end of ledger`). Per-row test-WA + category picker + source tag preserved.
  - `app/(app)/transactions/page.tsx` server component now passes initial 100 rows + total + categories + accounts to the client component. Page header shows total entry count.
- 2026-05-04 — **Phase 5 — live net-worth + apples-to-apples spending fix**:
  - `handlers/sync_plaid_item.ts` now captures the `accounts` array from the last `transactionsSync` response and uses it to (a) update `accounts.{current,available}_balance` and (b) upsert today's `balance_snapshots(account_id, date)` row. Zero extra Plaid API calls — the balance data was always in the sync response, we were just throwing it away. **Replaces the metered `accountsBalanceGet` path entirely** for normal operation.
  - Dashboard "Net worth" stat card now reads **live** from `sum(asset accounts) - sum(liability accounts)` over `accounts.current_balance`. The chart's "today" point is overlaid with the live total so the chart and card never disagree.
  - Dashboard "Spent this month" delta is now **same-day-of-month**: this-month-thru-today vs last-month-thru-same-day-of-month, with overflow handling for short months (Mar 31 → Feb 28). Footnote shows both same-window and full-last-month totals for context.
  - `app/api/refresh/route.ts` — auth-gated POST. Finds the user's active `plaid_items` with `last_synced_at < now-5min`, enqueues `sync_plaid_item` for each. Bundled in the Transactions subscription so it's free regardless of how often the user reloads.
  - `<RefreshOnMount>` mounted on the dashboard — fire-and-forget POST to `/api/refresh` once on mount (StrictMode-guarded with a ref). Result lands via the existing `<RealtimeListener>` — sync runs background, realtime ping triggers `router.refresh()`, the page re-renders with fresh numbers a few seconds later. Net effect: opening the app feels live.
  - Daily `accountsBalanceGet`-based `/api/cron/snapshot-balances` is now redundant (sync_plaid_item handles snapshots). Route + handler kept in place as a manual safety net but should be removed from cron-job.org's schedule (or downgraded to weekly).

---

## In progress

—

---

## Up next

**To get 24-month history**: disconnect Chase + Robinhood with "Also wipe transaction history" on `/accounts`, then re-link both via Plaid Link. The new linkTokenCreate now requests `days_requested: 730`, so the new items will pull 24 months. The partial unique index on `accounts.plaid_account_id` allows the re-link to claim the same Plaid account_ids that the archived ones still hold.

**Multi-user smoke-test** when a friend joins:
1. They sign up at `/signup` → trigger auto-creates their profile.
2. They visit `/settings` → enter their WhatsApp number → save.
3. They send `join {keyword}` to `whatsapp:+14155238886` once.
4. They link their bank on `/accounts`.
5. From there: notifications + replies route to their phone, scoped by `From` field.

**Outstanding config items** (whenever):
- **cron-job.org daily 03:00** → `/api/cron/snapshot-balances` (still useful as a backstop even though `transactionsSync` already writes daily snapshots).
- **cron-job.org hourly** → `/api/cron/sync-fallback`.

**Phase 7 candidates** (post-Phase-6 open-ended):
- `/admin/health` (categorization source mix, WA latency, recent failed jobs).
- Plaid recurring detection (`transactionsRecurringGet`, separate paid product) — "$X/mo on subscriptions."
- Category management (rename / recolor / merge / drag-reorder).
- Manual cash transaction entry.
- CSV / JSON export from the filter bar.
- Plaid webhook signature verification (security backlog — bumped to "fix this week" since prod is live).
- Bulk recategorize / bulk exclude on `/transactions`.
- Day-of-week / time-of-day spending heatmap (cute but low actionable value, deferred).
- Twilio Production WhatsApp (Meta business verification + template approvals — multi-day project, parked).

---

## Blocked

—

---

## Decisions log (the durable ones)

> Append-only. When a decision changes, add a new entry rather than editing the old one — leaves an audit trail.

- 2026-05-03 — **Stack**: Next.js on Vercel + Supabase (Postgres / Auth / Realtime / Storage) + Plaid (Limited Production) + Twilio WhatsApp sandbox + Anthropic Claude Haiku + Upstash QStash + cron-job.org. See [docs/01-architecture.md](docs/01-architecture.md).
- 2026-05-03 — **Auth**: email/password via Supabase. Not magic link, not Google OAuth. Reason: faster login UX for one user.
- 2026-05-03 — **Twilio sandbox indefinitely**, not approved templates. Reason: single user, no friction, no template review delay. Reassess only if we ever expand to other users.
- 2026-05-03 — **Splits support 4 modes**: `none`, `percent`, `fixed`, `ratio`. Store both `split_value` (computed) and `split_raw_input` (the user's literal text).
- 2026-05-03 — **Refund auto-pair**: only same merchant + exact amount within 30 days. Different-amount refunds left standalone for manual linking later.
- 2026-05-03 — **Pending → posted re-notify**: only when amount Δ > 5% OR category changed.
- 2026-05-03 — **Always guess, never ask**: WA notification always commits a category. User corrects via reply.
- 2026-05-03 — **Store every Plaid response verbatim**: `plaid_webhooks.payload` (jsonb) for inbound, `transactions.raw` (jsonb) per-row, `app_events` for the full sync response.
- 2026-05-03 — **Transfer pairing is synchronous** at the end of `categorize_transaction` to avoid the WA-notification race. `pair_refund` stays async.
- 2026-05-03 — **Next.js 16 deprecates `middleware.ts` → `proxy.ts`.** Renamed the file and the exported function (`middleware` → `proxy`). All Supabase-SSR session-refresh logic stayed identical.
- 2026-05-03 — **Sentry: `sendDefaultPii: false`** everywhere. Wizard defaults this to true; we override to enforce the no-financial-data-in-logs policy (docs/01-architecture.md §Logging hygiene).
- 2026-05-03 — **Plaid webhook signature verification deferred.** Plaid signs webhooks via JWT keyed against a JWKS endpoint. Implementing this end-to-end is non-trivial and the blast radius is currently bounded — the webhook only enqueues idempotent sync jobs against an existing `item_id`. Wire signature verification before we have any side-effect-bearing operations (Phase 3 onward).
- 2026-05-03 — **Vercel canonical URL pinned**: `https://finance-planning-nu.vercel.app` (Vercel auto-assigned this short alias since `finance-planning.vercel.app` was taken). Cron-job.org and Plaid webhook config use this stable URL; QStash callback URLs fall back to `VERCEL_URL` when `NEXT_PUBLIC_APP_URL`/`APP_URL` aren't set. The long `*-redacted-team.vercel.app` form also works but is uglier; the per-deployment `*-{hash}-...` URLs change every push and must NOT be used in env vars or external configs.
- 2026-05-03 — **Plaid env: temporarily on Sandbox.** All five OAuth institutions (Amex, Chase, Discover, Robinhood, PayPal) hit the "registration in review" gate on Production. Sandbox lets us exercise the full pipeline (encryption, webhooks, sync, UI) against synthetic First Platypus Bank / Houndstooth Bank data while we wait. Test creds: `user_good` / `pass_good`, MFA `1234`. Flip back to `PLAID_ENV=production` + production secret once OAuth registrations clear at https://dashboard.plaid.com/activity/status/oauth-institutions.
- 2026-05-03 — **Twilio inbound signature verification: ON.** The `/api/whatsapp/webhook` route validates `X-Twilio-Signature` (HMAC-SHA1 of full URL + sorted form params) via `twilio.validateRequest` before any DB write or job enqueue. Unlike Plaid (still deferred), this one is non-negotiable because the webhook causes side effects on real transactions (DB writes, outbound WA confirmations).
- 2026-05-03 — **WA reply matching window: 60 min, single-candidate only.** `parse_wa_reply` will silently apply an intent to a transaction *only* if exactly one tx is `last_notified_at >= now() - 60min AND last_user_edit_at IS NULL`. Two or more candidates → ask. Zero candidates → ask. This trades some friction (after a flurry of 5 notifications, replies need to be quoted) for never silently editing the wrong row.
- 2026-05-03 — **Receipts bucket = private.** All reads must go through Supabase Storage signed URLs (added in Phase 6 / detail view). Path layout `{user_id}/{tx_id}/{uuid}.{ext}` lets the storage policy authorize on `auth.uid() = first_segment` cleanly.
- 2026-05-04 — **Multi-action replies, single Action object.** Originally the intent schema was a discriminated union forcing one action per reply ("Don't combine intents" in the prompt). First real test ("categorize correctly and split half and half") proved that wrong — Claude picked split, dropped the recategorize. New schema: one `Action` object with optional `recategorize` / `split` / `note` / `exclude_set` / `unclear` fields, applied in a single DB update with stitched confirmation. Intent label on the inbound row is now compound (`recategorize+split`).
- 2026-05-04 — **No-quote replies match the latest notification, not "exactly one un-edited tx."** Original logic required exactly one tx with `last_notified_at >= now()-60min AND last_user_edit_at IS NULL` — too conservative; user got "🤔 Which transaction?" even when there was a single obvious target. New rule: take the SINGLE most-recent outbound `tx_notification`'s `related_transaction_id` within 60 min. Quoted replies still take precedence. Risk traded: stray messages within the window apply to the latest tx (acceptable; user can recategorize again).
- 2026-05-04 — **Photos do NOT trigger OCR or auto-action.** They are stored in `receipts/{user_id}/{tx_id}/{uuid}.{ext}` and listed in `transaction_attachments`. That's it. The text portion of the same WhatsApp message is parsed independently and applied. Reasoning: receipt OCR is a Phase 6+ feature with its own accuracy/risk surface; for now the photo is just an audit artifact.
- 2026-05-04 — **Stats aggregation in JS, not Postgres GROUP BY.** PostgREST doesn't expose `GROUP BY` over the typed Supabase JS client, and our row counts (single user, ≤ a few hundred tx/month) are tiny. The dashboard pulls raw `v_spending` rows for two months in one query and aggregates by category + by date in JS. Avoids an RPC + migration; if rows ever spike we add a server-side rollup view.
- 2026-05-04 — **Realtime via `router.refresh()`, debounced 400ms.** Cheaper than client-side cache invalidation: the closest server component re-runs its data fetch with no per-component invalidation logic, and a 400ms coalesce window prevents 30 separate refreshes during a Plaid sync that adds 30 rows. Trade-off: the whole page re-renders on every change, which is fine for a single-user dashboard with cheap queries.
- 2026-05-04 — **Snapshot job is per-item, not per-user.** Spec said `snapshot_balances` body `{}` aggregating all items in one job; we deviated to `{plaid_item_id}` matching the `sync_plaid_item` shape. Reason: one slow Plaid call on a flaky bank shouldn't drag the whole batch, and QStash retries should be scoped to the failed item.
- 2026-05-04 — **Live net-worth from `transactionsSync` accounts, not `accountsBalanceGet`.** Plaid's `transactionsSync` response includes the `accounts` array with current balances on every page. Reading those into `accounts.current_balance` + a daily snapshot is **free** because `transactionsSync` is bundled in the per-item Transactions subscription. The metered `accountsBalanceGet` (~$0.10–$0.30/call) is only needed to force a fresh broker pull, which we don't need for net-worth display. Trade: investment-account freshness is bounded by Plaid's own pull cadence to brokers (~2–3h during market hours), not ours.
- 2026-05-04 — **Net-worth model = bank truth (Model A), not transaction replay.** Considered replaying net worth from `effective_amount` history (would catch splits immediately) but rejected: it goes structurally blind to investment growth (Robinhood up 5% with no trade = invisible), drifts from the bank app, and never self-corrects on never-paid splits. Plaid balances are correct over time and self-correct when Venmo paybacks land. The split-dip is a small, temporary visual artifact we accept.
- 2026-05-04 — **Spending comparison = same day of month, not full month.** Comparing 4 days of May vs all 30 days of April was structurally misleading early-month. New rule: this-month-thru-today vs last-month-thru-same-day. Clamps to last day of previous month if the day overflows (Mar 31 → Feb 28). Footnote still surfaces the full-last-month total for sanity.
- 2026-05-04 — **`/api/refresh` is on-mount, not on-tap.** Dashboard auto-fires once via `<RefreshOnMount>` with a 5-min staleness gate per item. No manual refresh button — the realtime listener already handles "show fresh data when something changes." If a user is on the page and a sync lands from a webhook, they see the update without doing anything.
- 2026-05-04 — **Re-link path fixed; QR-code pairing on /settings.**
  - **Exchange route used an upsert against `plaid_account_id`** with `onConflict: "plaid_account_id"`. After migration 0009 demoted that column from a strict unique constraint to a partial unique index (`WHERE is_archived = false`), PostgREST could no longer match the conflict target — it errored with "no unique or exclusion constraint matching the ON CONFLICT specification" and returned 500. The plaid_items row was already created at that point, so re-link attempts left a stranded item with no accounts and no transactions. Verified by SQL: a freshly-linked Robinhood item existed with `status=active` and zero children. Cleaned up the stranded row + replaced the upsert with a plain insert. The partial index handles dedup correctly: re-linking after disconnect-with-wipe finds no active row with the same `plaid_account_id`, plain insert succeeds.
  - **Disconnect-with-wipe now hard-deletes the plaid_items row** (FKs cascade to accounts → transactions → balance_snapshots/attachments). The previous behavior soft-archived the accounts which kept their `plaid_account_id`s in the partial-index-shadowed state — fine for the partial index, but cluttered the DB and made the data model harder to reason about. Disconnect-without-wipe still soft-archives so users can keep history.
  - **Plaid linkTokenCreate now passes the user's profile WhatsApp number** as `phone_number` in production (Plaid Layer pre-fills with their own number instead of nothing). Sandbox path still uses `+14155550123` (Plaid's magic test number). No more risk of a hardcoded number leaking into a friend's link flow.
  - **QR code on `/settings`**: server-side `qrcode` package generates an SVG that encodes `https://wa.me/{sandbox-number}?text=join+{keyword}`. Reads `TWILIO_WHATSAPP_FROM` and `TWILIO_SANDBOX_JOIN_KEYWORD` from env. Scanning from phone (or tapping when on phone) opens WhatsApp pre-filled with the join command — friend just hits Send. Drops the friction of "find the keyword in Twilio Console, type it carefully into WhatsApp."
  - New env: `TWILIO_SANDBOX_JOIN_KEYWORD=musical-satisfied` (set in `.env.local`; needs to be added to Vercel env vars too).
- 2026-05-04 — **Multi-user infrastructure landed (migration 0010).**
  - `profiles` table: `(user_id, whatsapp_number, display_name)`, RLS owner-only, partial unique index on `whatsapp_number WHERE NOT NULL` so two accounts can't claim the same WA number. Auto-insert trigger on `auth.users` INSERT.
  - `lib/profile.ts`: `getUserWhatsAppNumber(userId)` and `findUserByWhatsAppNumber(fromField)` helpers, both via service-role.
  - `lib/twilio.ts`: removed `getWhatsAppTo()` env-var lookup. `sendWhatsAppMessage({to, body})` now requires an explicit recipient. `formatWhatsAppRecipient(phoneE164)` adds the `whatsapp:` prefix.
  - `handlers/send_wa_notification.ts`: looks up recipient via `getUserWhatsAppNumber(tx.user_id)`. Skips silently if no phone set (user finished signup but didn't complete WA onboarding).
  - `handlers/parse_wa_reply.ts`: `sendAndLog` uses the profile too. Outbound row is logged as `failed` with error `no_whatsapp_number` if the user's phone is unset, so the audit log still captures the attempt.
  - `app/api/whatsapp/webhook/route.ts`: inbound resolution swapped from "most recent outbound's user_id" to `findUserByWhatsAppNumber(From)`. No more single-user assumption. Drops silently if the sender isn't a user.
  - **`/settings` page**: form for display name + WhatsApp number with E.164 normalization + 10-digit-US auto-prefix + unique-constraint friendly error. Server action `updateProfile` with revalidation. Plus copy explaining the Twilio-sandbox `join {keyword}` step each new user has to do.
  - `USER_WHATSAPP_TO` env var is no longer read anywhere — safe to delete from Vercel env vars (existing user's number was migrated to `profiles.whatsapp_number` via SQL).
- 2026-05-04 — **WA notifications are silent on backfill (>2 days old) and on Transfer-categorized rows.** Linking a new Plaid sandbox item fired 61 `tx_notification` rows in 5 seconds because the initial sync replayed every historical tx through categorize → send_wa_notification. Two gates added in `send_wa_notification`: (a) `variant='new'` skip when `tx.date < now − 2 days` (real-time tx are always today/yesterday); (b) skip when `user_category = 'Transfer'` even if `is_transfer = false` (Plaid PFC tags things like "CD DEPOSIT", "CREDIT CARD PAYMENT", "AUTOMATIC PAYMENT" as Transfer; the transfer-pair worker only flips `is_transfer` when both sides exist among user-owned accounts, so "lone transfers" leak through). The `re-notify` variant is exempt from the age gate.
- 2026-05-04 — **Plaid env: PRODUCTION** (supersedes the 2026-05-03 sandbox entry above). Approval cleared (Chase + Amex). `.env.local` and Vercel env vars (Production + Development targets) rotated to `PLAID_ENV=production` + production `PLAID_SECRET`. Existing 3 sandbox `plaid_items` in DB still hold sandbox-encrypted access tokens — `transactionsSync` against them will 400 against production env. Disconnect them via the new `/accounts` UI before linking real banks.
- 2026-05-04 — **Disconnect = soft by default, opt-in hard wipe.** `/api/plaid/disconnect` always (a) tries `itemRemove` on Plaid (best-effort — sandbox tokens against production env will 400, that's fine), (b) sets `plaid_items.status='disconnected'`, and (c) archives accounts. Transactions are preserved by default for history. The `wipe_transactions: true` body flag (exposed as a checkbox in the confirm dialog) additionally soft-deletes every transaction on those accounts — meant for sandbox-cleanup before real-bank cutover, NOT a routine disconnect.

---

## One-off DB cleanups applied (audit log)

- 2026-05-03 — **Backfilled `plaid_category` / `plaid_category_detail` / `plaid_confidence`** on existing rows from `transactions.raw->'personal_finance_category'`. Pre-fix: 0 rows had these columns populated because they were synced before migration 0004; the Plaid PFC was sitting unused inside `raw` jsonb. Post-fix: 27 of 54 rows (~50%) now have HIGH/VERY_HIGH Plaid confidence ready for the Plaid tier of the waterfall. **No Plaid contributions seen until after this fix.**
- 2026-05-03 — **Deleted bad rule** `category_rules` row `united airlines → Eating Out`. User mistakenly trained it during a smoke test. Plaid PFC for United Airlines is `TRAVEL_FLIGHTS` at VERY_HIGH confidence, so re-running the waterfall categorizes it correctly as Travel.
- 2026-05-03 — **Reset categorization on all non-manual rows** (`user_category` + `category_source` + `ai_*` set to NULL). Manual edits preserved. Recategorize button (or `/api/admin/backfill-categorize`) re-fills via the now-fixed waterfall.
- 2026-05-03 — **Created private `receipts` Storage bucket** + storage policies authorizing on first-path-segment = `auth.uid()` (Phase 4 / migration 0007). Empty on creation; populated as inbound WA replies bring in photos.

---

## Known issues / minor bugs

> Things that work but aren't quite right. Fix as time allows; don't ship to a real (multi-)user without addressing.

- **`category_rules.times_applied` doesn't actually increment.** [lib/categorize.ts:62](lib/categorize.ts) writes a literal `1` instead of `times_applied + 1` when a rule matches. The Supabase JS client doesn't expose Postgres `+= 1` syntax — fix is a SECURITY DEFINER RPC `increment_category_rule_usage(user_id, merchant_pattern)` that does an atomic `UPDATE … SET times_applied = times_applied + 1, last_applied_at = now()`. Cosmetic for one user (the column was meant to power "your most-trained rules" analytics in Phase 6); not a correctness bug — wrong category is never returned.
- **Plaid webhook signature verification still deferred** — and now we ARE on Production with real bank data flowing. Bumped from "should fix" to "fix this week." Blast radius: a forged webhook with a known `item_id` triggers our sync (idempotent — Plaid is the cursor source of truth, so worst case is a few wasted API calls and noise in `app_events`). Still: real money flow, sign the damn webhook.
- **No web UI for receipts yet.** Photos uploaded via WhatsApp land in the private `receipts` bucket and the `transaction_attachments` table, but `/transactions` doesn't render them. Phase 6 will add a transaction-detail page with signed-URL thumbnails.
- **Inbound user_id resolution is single-user.** `app/api/whatsapp/webhook/route.ts:resolveInboundUserId` finds the most recent outbound row's `user_id`, falling back to "first user in `auth.users`" if there are no outbounds yet. Fine for one user; would need to map by `From` (WhatsApp number) → user lookup if we ever expand.

---

## Open questions to resolve during build

- Pending coverage on Robinhood and PayPal — verify when first transactions land in P1.
- Whether `effective_amount` works as a Postgres generated column with our split logic, or needs a trigger. Verify in P2.1.
- QStash free-tier limit (500 msg/day) holds in practice — measure during P2/P3.
- Twilio sandbox session: confirm "join {keyword}" doesn't silently expire. Note any reconnect events.
- Twilio "Test credentials" currently in `.env.local` won't actually send WhatsApp from the sandbox — replace with live Account SID / Auth Token before Phase 3.

---

## Notes

- Vercel project ID: `prj_*` — see `.vercel/project.json` (gitignored).
- Vercel team: `redacted-team` (slug: `redacted-team`).
- Supabase project ID: `redacted-project-ref` (region: `us-west-2`, Postgres 17).
- Vercel automatically connected the GitHub repo, so future pushes to `main` deploy to production preview and `vercel --prod` promotes.
- Deployment Protection (Vercel SSO) is on by default for the deploy URL — opening the URL in an incognito browser will hit Vercel's auth wall. Disable in project settings if you want public access (Supabase auth still gates everything).
