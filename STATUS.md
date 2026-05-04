# Status

Living tracker. Updated at the end of every working session. Source of truth for "where are we right now."

For the executable plan, see [docs/07-build-plan.md](docs/07-build-plan.md).
For the spec, see [docs/00-overview.md](docs/00-overview.md) and the rest.

---

## Current phase

**Phase 2 — Categorization** ✅ done. Ready for Phase 3 (WhatsApp out).

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

---

## In progress

—

---

## Up next

**Phase 2 smoke tests** (do once after the deploy lands):

1. POST `/api/admin/backfill-categorize` (signed in) to categorize all existing sandbox transactions. Watch Vercel logs for the worker invocations.
2. Open `/transactions` — every row should show a category pill. Mostly Plaid-sourced (sandbox data has confident PFCs), some AI for ambiguous merchants.
3. Click a category pill → pick a different one → confirm: row updates, toast appears, `category_rules` table has a new row keyed on the normalized merchant. Sync again — next transaction from that merchant should use the rule.
4. Trigger a sandbox transfer (`/sandbox/item/fire_webhook` or via Plaid Link's "Test Transfer" UI if available) — both legs should auto-pair as Transfer.

**Then Phase 3 — WhatsApp out**: Twilio sandbox setup, `whatsapp_messages` table, `send_wa_notification` worker, hook into end of `categorize_transaction`.

**Phase 1 wrap-up still pending** (do these whenever ready):
- **Plaid Dashboard** → Webhook URL → `https://finance-planning-nu.vercel.app/api/plaid/webhook`
- **cron-job.org** → hourly GET `https://finance-planning-nu.vercel.app/api/cron/sync-fallback` with `Authorization: Bearer <CRON_SECRET>`

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

---

## One-off DB cleanups applied (audit log)

- 2026-05-03 — **Backfilled `plaid_category` / `plaid_category_detail` / `plaid_confidence`** on existing rows from `transactions.raw->'personal_finance_category'`. Pre-fix: 0 rows had these columns populated because they were synced before migration 0004; the Plaid PFC was sitting unused inside `raw` jsonb. Post-fix: 27 of 54 rows (~50%) now have HIGH/VERY_HIGH Plaid confidence ready for the Plaid tier of the waterfall. **No Plaid contributions seen until after this fix.**
- 2026-05-03 — **Deleted bad rule** `category_rules` row `united airlines → Eating Out`. User mistakenly trained it during a smoke test. Plaid PFC for United Airlines is `TRAVEL_FLIGHTS` at VERY_HIGH confidence, so re-running the waterfall categorizes it correctly as Travel.
- 2026-05-03 — **Reset categorization on all non-manual rows** (`user_category` + `category_source` + `ai_*` set to NULL). Manual edits preserved. Recategorize button (or `/api/admin/backfill-categorize`) re-fills via the now-fixed waterfall.

---

## Known issues / minor bugs

> Things that work but aren't quite right. Fix as time allows; don't ship to a real (multi-)user without addressing.

- **`category_rules.times_applied` doesn't actually increment.** [lib/categorize.ts:62](lib/categorize.ts) writes a literal `1` instead of `times_applied + 1` when a rule matches. The Supabase JS client doesn't expose Postgres `+= 1` syntax — fix is a SECURITY DEFINER RPC `increment_category_rule_usage(user_id, merchant_pattern)` that does an atomic `UPDATE … SET times_applied = times_applied + 1, last_applied_at = now()`. Cosmetic for one user (the column was meant to power "your most-trained rules" analytics in Phase 6); not a correctness bug — wrong category is never returned.
- **Plaid webhook signature verification still deferred** (decision logged earlier). Acceptable while webhooks only enqueue idempotent syncs; **must** be wired before Phase 3 lands WhatsApp side effects.

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
