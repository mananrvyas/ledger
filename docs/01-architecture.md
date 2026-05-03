# 01 — Architecture

## Stack

| Layer | Tech |
|---|---|
| Frontend / API | Next.js 15+ (app router, TypeScript, React 19) |
| Hosting | Vercel |
| DB | Supabase Postgres (RLS, pgcrypto, Realtime) |
| Auth | Supabase Auth (email + password) |
| Bank data | Plaid (Limited Production), `transactions/sync` |
| Messaging | Twilio WhatsApp Business API (sandbox) |
| LLM | Anthropic Claude Haiku (`@anthropic-ai/sdk`) |
| File storage | Supabase Storage (receipts) |
| Async / queue | Upstash QStash (HTTP-pushed jobs) |
| Scheduling | cron-job.org → signed endpoints |
| Charts | Recharts |
| UI | shadcn/ui + Tailwind v4 + lucide-react |
| Errors / observability | Sentry (free tier) |

## High-level diagram

```
                ┌───────────────────────────────────────────────┐
                │                Vercel (Next.js)                │
                │                                                │
   Plaid  ─────▶│  /api/plaid/webhook  ──┐                       │
                │                        │                       │
   Twilio ─────▶│  /api/whatsapp/wbhk ─┐ │                       │
                │                      │ │                       │
   cron-job ───▶│  /api/cron/*       ──┤ ├──▶ enqueue ──┐        │
                │                      │ │              │        │
                │  /api/qstash/job ◀───┘─┘              ▼        │
                │       (queue worker)        ┌──────────────┐   │
                │                             │ Upstash QStash│   │
                │  /api/* (REST for UI)       └──────────────┘   │
                │                                                │
                │  /(pages) + components + realtime client       │
                └────────────────┬───────────────────────────────┘
                                 │
                                 ▼
                ┌───────────────────────────────────────────────┐
                │                  Supabase                      │
                │   Postgres (RLS) ─ Auth ─ Storage ─ Realtime   │
                │   + pgcrypto for encrypted access tokens       │
                └───────────────────────────────────────────────┘
                                 │
                                 ▼
                ┌───────────────────────────────────────────────┐
                │  External: Plaid API, Twilio API, Anthropic   │
                └───────────────────────────────────────────────┘
```

QStash is the only "extra" piece. It's HTTP-pushed (no workers to run) — we POST a job to it, it POSTs back to `/api/qstash/job/{type}` with retries on non-2xx responses.

---

## Data flow scenarios

### A. New transaction lands

1. Plaid POSTs webhook (`TRANSACTIONS / SYNC_UPDATES_AVAILABLE`) to `/api/plaid/webhook`.
2. Handler verifies Plaid signature, inserts raw payload into `plaid_webhooks`, returns **200 immediately**.
3. Handler enqueues a `sync_plaid_item` job to QStash.
4. QStash invokes `/api/qstash/job/sync_plaid_item` with the item ID.
5. Worker calls `transactionsSync` from the item's stored cursor, gets `added / modified / removed`. Stores the **full raw response** alongside structured rows. Updates cursor.
6. For each `added`: insert into `transactions` (with `raw` jsonb column = full Plaid tx object). Enqueue `categorize_transaction` per tx.
7. `categorize_transaction` runs the waterfall. Updates `user_category` + `category_source`. Enqueues `pair_transfer` and `pair_refund` for the same tx.
8. After categorization (or in parallel for non-transfers), enqueues `send_wa_notification` for the tx.
9. `send_wa_notification` worker calls Twilio, logs sent message into `whatsapp_messages`.

For `modified` transactions: re-evaluate. If `is_pending` flipped from true → false AND (amount Δ > 5% OR category changed) → enqueue another `send_wa_notification` with re-notify template variant. Otherwise silent update.

For `removed` transactions: soft-delete (mark a `deleted_at` column) — never hard-delete to keep history.

### B. WhatsApp reply

1. You reply to the bot's notification.
2. Twilio POSTs to `/api/whatsapp/webhook`.
3. Handler verifies `X-Twilio-Signature`, inserts raw inbound payload into `whatsapp_messages` (direction=inbound), returns 200 immediately.
4. Handler enqueues `parse_wa_reply` job.
5. Worker:
   - Resolves target transaction: prefer Twilio's `OriginalRepliedMessageSid` (quoted reply) → look up the matching `whatsapp_messages.related_transaction_id`. Else: most recent un-edited transaction in the last 60 minutes for this user. Else: ask "which transaction?" and exit.
   - Downloads any media attachments, uploads to Supabase Storage, creates `transaction_attachments` rows.
   - Calls Claude Haiku with structured output to parse intent: `{intent, split_type?, split_value?, new_category?, note?, exclude?}`.
   - Applies the change to the transaction. Sets `category_source = 'manual'` if recategorized. Persists a `category_rules` row if the recategorization is for a known merchant.
   - Sends a free-form confirmation reply via Twilio (free-form OK because we're inside the 24-hour window).

### C. Daily balance snapshot

1. cron-job.org calls `/api/cron/snapshot-balances` daily at ~03:00 user-local with a shared secret header.
2. Handler iterates `plaid_items`, decrypts each access token, calls Plaid `accountsBalanceGet`.
3. Inserts one row per account into `balance_snapshots` for today's date (idempotent via unique constraint).

### D. Plaid item error (e.g., ITEM_LOGIN_REQUIRED)

1. Plaid posts ITEM webhook with error.
2. Handler updates `plaid_items.status` and `error_*` fields.
3. Worker enqueues a low-priority `notify_item_error` job → WhatsApp message: "Reconnect Amex — login expired."
4. Dashboard shows a "Reconnect" CTA on the affected item; clicking starts Plaid Link in update mode.

### E. Fallback sync (safety net)

1. cron-job.org calls `/api/cron/sync-fallback` every 60 minutes.
2. Handler finds any `plaid_items` where `last_synced_at` is older than 90 minutes AND `status = 'active'`.
3. Enqueues `sync_plaid_item` for each → same flow as scenario A.

---

## Queueing strategy (Upstash QStash)

**Why a queue:** webhook handlers must respond fast (Plaid retries on slow responses; Twilio expects <15s). Categorization and Twilio sends can be slow / fail. Idempotent retries are essential.

**Job types:**

| Job | Trigger | Worker route | Retries |
|---|---|---|---|
| `sync_plaid_item` | Plaid webhook, fallback cron | `/api/qstash/job/sync_plaid_item` | 5, exp backoff |
| `categorize_transaction` | After sync inserts a tx | `/api/qstash/job/categorize_transaction` | 3 |
| `pair_transfer` | After categorize | `/api/qstash/job/pair_transfer` | 2 |
| `pair_refund` | After categorize, only for negative amounts | `/api/qstash/job/pair_refund` | 2 |
| `send_wa_notification` | After categorize, or on pending→posted change | `/api/qstash/job/send_wa_notification` | 5, exp backoff |
| `parse_wa_reply` | Twilio webhook | `/api/qstash/job/parse_wa_reply` | 3 |
| `snapshot_balances` | Daily cron | `/api/qstash/job/snapshot_balances` | 2 |
| `notify_item_error` | Plaid item-error webhook | `/api/qstash/job/notify_item_error` | 3 |

**Idempotency:**
- All jobs accept an `idempotency_key` (we use the natural key — `plaid_transaction_id`, `twilio_message_sid`, `(item_id, cursor)`, etc.).
- Workers check if work was already done (e.g., `transactions.user_category IS NOT NULL` for categorize) before doing it again.

**Auth on worker routes:** every `/api/qstash/job/*` route verifies QStash's signing key (`Upstash-Signature` header). Unsigned requests are rejected.

**Dead-letter:** after final retry failure, QStash can post to a configured failure URL → `/api/qstash/dlq` writes a row in `app_events` with `event_type = 'job_failed'`. Health page surfaces these.

---

## Security

### Authentication

- **User-facing:** Supabase Auth, email + password. Sessions via `@supabase/ssr` httpOnly cookies. Middleware refreshes sessions.
- **Webhook routes:** signature verification.
  - Plaid: HMAC-SHA256 of body with verification key from Plaid's JWKS endpoint.
  - Twilio: `X-Twilio-Signature` header, HMAC of full URL + sorted POST params with auth token.
  - QStash: `Upstash-Signature` header, JWT signed by QStash signing key.
  - cron-job.org → cron routes: shared secret in `Authorization: Bearer <secret>` header.

### Authorization

- **RLS** on every user-scoped table. Pattern: `USING (user_id = auth.uid())` with separate policies for SELECT / INSERT / UPDATE / DELETE.
- Webhook handlers and queue workers use the **service-role key** to bypass RLS (they act on the user's behalf, but don't have an auth context). The user_id is read from the parent record (e.g., `plaid_items.user_id`) and propagated to children.
- Service-role key is never exposed to the browser.

### Secrets at rest

- **Plaid access tokens** encrypted via pgcrypto. `store_plaid_item(passphrase)` and `get_plaid_access_token(passphrase)` SQL functions; passphrase in env var, never persisted.
- **Twilio / Anthropic / QStash keys**: env vars only.

### Logging hygiene

- Don't log transaction amounts, merchant names, or message bodies to Sentry / Vercel logs. Log IDs and event types only.
- `plaid_webhooks` and `whatsapp_messages` ARE the audit log. They live in our DB, behind RLS — that's the only place full payloads exist.

---

## Observability

- **Sentry**: server + browser, free tier. Errors only — no breadcrumbs that include payloads.
- **Vercel logs**: function invocations, structured JSON. ID-only logging policy.
- **Health page** at `/admin/health` (gated to your user):
  - Last sync per Plaid item (status, time, error if any)
  - Webhook success rate over last 24h (Plaid + Twilio)
  - Queue job stats (sent, succeeded, failed, retried) over last 24h
  - Categorization mix breakdown (% Plaid / % rule / % AI / % manual) over last 30 days
  - Open `app_events.event_type = 'job_failed'` rows
  - Plaid items needing reconnect

---

## Environment variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # server-only, never bundled

# Encryption (pgcrypto passphrase for Plaid tokens)
ENCRYPTION_PASSPHRASE

# Plaid
PLAID_CLIENT_ID
PLAID_SECRET                     # production secret
PLAID_ENV=production             # or sandbox during dev
PLAID_WEBHOOK_VERIFICATION_KEY   # optional cache; library can fetch JWKS

# Twilio
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM             # the sandbox number, e.g., whatsapp:+14155238886
USER_WHATSAPP_TO                 # your number, e.g., whatsapp:+1xxxxxxxxxx

# Anthropic
ANTHROPIC_API_KEY

# Upstash QStash
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY

# Cron secret (shared with cron-job.org)
CRON_SECRET

# App
APP_URL                          # https://...vercel.app, used for QStash callback URLs
SENTRY_DSN
SENTRY_AUTH_TOKEN                # for sourcemap upload
```

---

## Third-party setup checklist

1. **Supabase**: create project, enable email auth (disable magic link), create Storage bucket `receipts` (private), apply migrations, run pgcrypto extension, create encryption helper functions.
2. **Vercel**: connect repo, set all env vars, deploy.
3. **Plaid dashboard**: create webhook URL pointing at `https://APP_URL/api/plaid/webhook`, confirm Limited Production tier.
4. **Twilio**: WhatsApp sandbox, join with your phone, set inbound webhook to `https://APP_URL/api/whatsapp/webhook`, configure status callback URL.
5. **Upstash QStash**: copy `QSTASH_TOKEN` and signing keys.
6. **cron-job.org**: create two jobs:
   - Daily 03:00 → `https://APP_URL/api/cron/snapshot-balances`
   - Hourly → `https://APP_URL/api/cron/sync-fallback`
   Both with `Authorization: Bearer ${CRON_SECRET}` header.
7. **Anthropic**: API key, basic monthly cap (~$5).
8. **Sentry**: project, DSN, source-map upload integration with Vercel.
