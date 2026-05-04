# Status

Living tracker. Updated at the end of every working session. Source of truth for "where are we right now."

For the executable plan, see [docs/07-build-plan.md](docs/07-build-plan.md).
For the spec, see [docs/00-overview.md](docs/00-overview.md) and the rest.

---

## Current phase

**Phase 0 — Scaffold** ✅ done. Ready for Phase 1 (Plaid plumbing).

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

---

## In progress

—

---

## Up next

**Phase 1 — Plaid plumbing.** First task: 1.2 — apply migration `0001_extensions_and_helpers.sql` via Supabase MCP (`pgcrypto`, `pg_trgm`, `uuid-ossp` + `store_plaid_item` and `get_plaid_access_token` helper functions).

See [docs/07-build-plan.md §Phase 1](docs/07-build-plan.md) for the full task list.

**Optional smoke tests before moving on (recommended):**
- Sign up + sign in on the deployed URL (or `npm run dev` locally) to confirm auth round-trips.
- Hit `/sentry-example-page` (after signing in) → click the "throw" button → confirm an error shows up in Sentry's Issues view.

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
