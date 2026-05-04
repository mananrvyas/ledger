# Status

Living tracker. Updated at the end of every working session. Source of truth for "where are we right now."

For the executable plan, see [docs/07-build-plan.md](docs/07-build-plan.md).
For the spec, see [docs/00-overview.md](docs/00-overview.md) and the rest.

---

## Current phase

**Phase 5 — Stats & charts** — live, with the live-net-worth + same-day comparison fixes shipped. Net worth is computed from `accounts.current_balance` (refreshed by every `transactionsSync` response — zero metered Plaid Balance calls). Dashboard auto-fires `/api/refresh` on mount so opening the app nudges a sync, then the realtime listener swaps in the fresh number. Spending comparison is now apples-to-apples: this-month-thru-day-N vs last-month-thru-day-N. Daily snapshot cron is now redundant — should be downgraded to weekly or removed from cron-job.org.

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

**Phase 5 wrap-up — one cron-job.org config + smoke-test the dashboard.**

1. **cron-job.org** → schedule a daily 03:00 GET to `https://finance-planning-nu.vercel.app/api/cron/snapshot-balances` with `Authorization: Bearer <CRON_SECRET>`. After a few days, the net-worth chart will start showing real movement instead of a single seeded point.

2. **Visual smoke-test** at `/`:
   - Top cards: "Spent this month" total + "vs last" delta; "Net worth" + 30d delta.
   - Donut: spending by category, this month, with center total + legend (top 6 + "+ N more").
   - Bars: daily spending, this month (zero days included).
   - Area: net-worth line, last 90 days (currently 1 point — will fill in).
   - Recent activity: last 8 non-deleted transactions.
   - Realtime: edit a category via WhatsApp or the picker — dashboard re-renders within a second.

**Phase 1 wrap-up still pending** (do whenever):
- **Plaid Dashboard** → Webhook URL → `https://finance-planning-nu.vercel.app/api/plaid/webhook`
- **cron-job.org** → hourly GET `https://finance-planning-nu.vercel.app/api/cron/sync-fallback` with `Authorization: Bearer <CRON_SECRET>`

**Then** — `/transactions` filters (date range, category, account, search, toggles, URL-driven), or jump to **Phase 6** polish:
- Transaction detail page with signed-URL receipt thumbnails (Phase 4's WA-uploaded photos viewable in the web UI).
- `/admin/health` (categorization source mix, WA latency, recent failed jobs).
- Category management (rename / recolor / merge).
- Manual transaction creation (cash).
- CSV export.

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
- 2026-05-04 — **WA notifications are silent on backfill (>2 days old) and on Transfer-categorized rows.** Linking a new Plaid sandbox item fired 61 `tx_notification` rows in 5 seconds because the initial sync replayed every historical tx through categorize → send_wa_notification. Two gates added in `send_wa_notification`: (a) `variant='new'` skip when `tx.date < now − 2 days` (real-time tx are always today/yesterday); (b) skip when `user_category = 'Transfer'` even if `is_transfer = false` (Plaid PFC tags things like "CD DEPOSIT", "CREDIT CARD PAYMENT", "AUTOMATIC PAYMENT" as Transfer; the transfer-pair worker only flips `is_transfer` when both sides exist among user-owned accounts, so "lone transfers" leak through). The `re-notify` variant is exempt from the age gate.
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
- **Plaid webhook signature verification still deferred** (decision logged earlier). Now the *only* unverified webhook in the system (Twilio inbound is signed as of P4). Plaid webhooks still only enqueue idempotent sync jobs against an existing `item_id`, so the blast radius remains bounded — but we should wire it before flipping back to Plaid Production with real bank data.
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
