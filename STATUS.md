# Status

Living tracker. Updated at the end of every working session. Source of truth for "where are we right now."

For the executable plan, see [docs/07-build-plan.md](docs/07-build-plan.md).
For the spec, see [docs/00-overview.md](docs/00-overview.md) and the rest.

---

## Current phase

**Phase 1 — Plaid plumbing** — code complete; pending external config (Plaid webhook URL, cron-job.org) + first bank linking.

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
  - First production deploy: <https://finance-planning-9fk8vrdvq-redacted-team.vercel.app>
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
  - Vercel `NEXT_PUBLIC_APP_URL` / `APP_URL` updated to canonical production URL `https://finance-planning-redacted-team.vercel.app`.

---

## In progress

—

---

## Up next

**Phase 1 wrap-up — three external configurations + a smoke test.**

Production URL: <https://finance-planning-redacted-team.vercel.app>

1. **Plaid Dashboard** → Team Settings → API → Allowed redirect URIs / Webhooks. Set the production webhook URL:
   ```
   https://finance-planning-redacted-team.vercel.app/api/plaid/webhook
   ```
2. **cron-job.org** — create a job:
   - URL: `https://finance-planning-redacted-team.vercel.app/api/cron/sync-fallback`
   - Method: GET
   - Schedule: every 60 minutes
   - Header: `Authorization: Bearer <CRON_SECRET>` (the value in `.env.local`)
3. **Try it**: log in to the deployed app → /accounts → "Connect a bank" → connect Amex (or any). Verify:
   - The `plaid_items` table has a row with an encrypted `access_token_enc` (bytea, not plaintext).
   - The `accounts` table has rows.
   - Within ~30s, the `transactions` table starts populating.
   - `app_events` has a `plaid_sync_response` row with the counts.

If any step fails, check Vercel function logs and Supabase logs.

**Then Phase 2 — Categorization** (default categories, waterfall, transfer/refund pairing).

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
- 2026-05-03 — **Vercel canonical URL pinned**: `https://finance-planning-redacted-team.vercel.app`. Cron-job.org and Plaid webhook config use this stable URL; QStash callback URLs fall back to `VERCEL_URL` when `NEXT_PUBLIC_APP_URL`/`APP_URL` aren't set.

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
