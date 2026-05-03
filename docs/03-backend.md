# 03 — Backend

Three classes of routes:
1. **App API** — authenticated, called by the web UI. RLS enforces ownership.
2. **Webhook receivers** — called by Plaid/Twilio. Signature-verified. Bypass RLS via service role.
3. **Queue workers / cron handlers** — called by QStash or cron-job.org. Signature/secret verified.

All routes are Next.js app-router route handlers in `app/api/...`.

---

## App API (auth required)

Auth via Supabase SSR client. Every handler resolves user via `supabase.auth.getUser()` and returns 401 if missing. Then RLS does the rest.

### Plaid Link

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/plaid/link/create-token` | `{}` | Create a Plaid Link token. Configures webhook URL = `${APP_URL}/api/plaid/webhook`. Returns `{link_token}`. |
| POST | `/api/plaid/link/exchange` | `{public_token, metadata}` | Exchange for access token. Stores via `store_plaid_item()` (encrypted). Inserts accounts. Enqueues `sync_plaid_item` for initial historical sync (24-month window). Returns `{plaid_item_id}`. |
| POST | `/api/plaid/disconnect` | `{plaid_item_id}` | Calls Plaid `itemRemove`, soft-deletes the item (status='disconnected'), keeps transactions in DB for history. |
| POST | `/api/plaid/sync` | `{plaid_item_id?}` | Manual sync trigger (debugging / "refresh now" button). Enqueues `sync_plaid_item` for one item or all. |

### Transactions

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/transactions` | query: `?from&to&account_id&category&q&pending&transfer&page&limit` | Paginated list. |
| GET | `/api/transactions/:id` | — | Single transaction with attachments. |
| PATCH | `/api/transactions/:id` | partial: `{user_category?, split_type?, split_value?, split_raw_input?, notes?, excluded_from_stats?}` | Edit. Sets `category_source='manual'` and `last_user_edit_at`. If `user_category` changed, upsert into `category_rules`. Recomputes `effective_amount`. |
| DELETE | `/api/transactions/:id` | — | Soft-delete (`deleted_at = now()`). Used rarely (e.g., known duplicate). |
| POST | `/api/transactions/:id/attachments` | multipart | Manual receipt upload from web. Saves to Supabase Storage, inserts `transaction_attachments` row. |

### Categories

| Method | Path | Body |
|---|---|---|
| GET | `/api/categories` | — |
| POST | `/api/categories` | `{name, color?, icon?, parent_id?}` |
| PATCH | `/api/categories/:id` | `{name?, color?, icon?, sort_order?}` |
| DELETE | `/api/categories/:id` | `{reassign_to?: category_name}` — if provided, bulk-update transactions; else null them out. |

### Accounts

| Method | Path |
|---|---|
| GET | `/api/accounts` — list with current balances |
| PATCH | `/api/accounts/:id` — `{is_archived?}` |

### Stats

| Method | Path | Description |
|---|---|---|
| GET | `/api/stats/spending` | `?from&to&group_by=category|date|account` — uses `v_spending` |
| GET | `/api/stats/net-worth` | `?from&to` — uses `v_net_worth_daily` |
| GET | `/api/stats/category-mix` | last 30 days source breakdown for health page |

### Settings

| Method | Path |
|---|---|
| GET | `/api/me` — current user, WhatsApp number, etc. |
| PATCH | `/api/me` — update profile |

---

## Webhook receivers (no user auth, signature verified)

### `POST /api/plaid/webhook`

1. Read raw body (Plaid signature requires unmodified bytes).
2. Verify Plaid JWT signature: fetch JWKS, validate `webhook_verification` JWT in `Plaid-Verification` header, check body hash matches.
3. Parse JSON. Look up `plaid_items` by `item_id` field to resolve `user_id`.
4. Insert into `plaid_webhooks` (raw payload, both processed and unprocessed kept forever).
5. Dispatch by `webhook_type` + `webhook_code`:
   - `TRANSACTIONS / SYNC_UPDATES_AVAILABLE` → enqueue `sync_plaid_item`
   - `TRANSACTIONS / DEFAULT_UPDATE` (legacy) → enqueue `sync_plaid_item`
   - `TRANSACTIONS / TRANSACTIONS_REMOVED` → already covered by sync, no-op
   - `ITEM / ERROR` → update `plaid_items.status` + error fields, enqueue `notify_item_error`
   - `ITEM / PENDING_EXPIRATION` / `USER_PERMISSION_REVOKED` → similar
   - Anything else → log only.
6. Mark `plaid_webhooks.processed = true`, return 200.

**Constraint:** total handler must respond <2s. Do not call Plaid synchronously. Push everything to queue.

### `POST /api/whatsapp/webhook`

1. Read raw body and form params.
2. Verify `X-Twilio-Signature`: HMAC-SHA1 of full URL + sorted POST params with auth token.
3. Resolve `user_id` from `From` field (your WhatsApp number, hard-mapped for one user).
4. Insert into `whatsapp_messages` (direction='inbound', raw payload).
5. Enqueue `parse_wa_reply` job with the message ID.
6. Return 200 with empty TwiML response. (No reply at this point — confirmation comes from the worker.)

---

## Queue worker routes (QStash signature verified)

Pattern: `POST /api/qstash/job/{job_type}` with body `{idempotency_key, ...payload}`.

Every worker:
1. Verifies `Upstash-Signature` JWT.
2. Reads idempotency key, checks if work already done — if so, return 200 with `{skipped: true}`.
3. Performs work.
4. On success: returns 200.
5. On failure: throw → returns 500 → QStash retries per policy.

### `sync_plaid_item`

Body: `{plaid_item_id}`

1. Load `plaid_items` row, decrypt access token.
2. Loop: call `transactionsSync(access_token, cursor)` until `has_more=false`. Accumulate `added`, `modified`, `removed`.
3. **Store the full sync response** to a row in `app_events` (`event_type = 'plaid_sync_response'`) for auditability.
4. For each `added` Plaid tx:
   - Resolve `account_id` from `plaid_account_id`.
   - Upsert into `transactions` by `plaid_transaction_id`. Store full Plaid tx into `raw` jsonb.
   - If conflict (already inserted), skip.
5. For each `modified`:
   - Read current row. Compute `was_pending`, `old_amount`, `old_category`.
   - Update structured columns + `raw`.
   - If `was_pending=true AND new is_pending=false` (transition pending→posted) AND (`abs(new_amount - notified_amount) / notified_amount > 0.05` OR category changed) → enqueue `send_wa_notification` with `variant='re-notify'`.
6. For each `removed`: set `deleted_at = now()`.
7. Update `plaid_items.cursor`, `last_synced_at`.
8. After commit: enqueue `categorize_transaction` for each newly added tx (via QStash batch publish).

### `categorize_transaction`

Body: `{transaction_id}`

1. Load tx + user's categories + relevant `category_rules` row (one query).
2. Run waterfall (see `04-categorization.md`).
3. Update tx with `user_category`, `category_source`, `ai_*` if applicable.
4. Enqueue `pair_transfer` and (if `amount < 0` or merchant suggests refund) `pair_refund`.
5. Enqueue `send_wa_notification` (unless `is_transfer = true` after pairing — but pairing runs after categorize, so we send WA first, and pair_transfer can re-categorize and silently update WA-already-sent message via separate logic; or we delay WA briefly. **Decision: pair_transfer runs synchronously at the end of categorize_transaction**, not as a separate job, to avoid the race. `pair_refund` can stay async.)

### `pair_transfer` (called inline at end of categorize_transaction)

1. For the new tx with amount A on account X, query for a tx on a *different* account owned by the same user, within ±3 days, with amount = -A (sign flipped), where neither is already paired.
2. If exactly one match: set both `is_transfer=true`, set `transfer_pair_id` bidirectionally, set `user_category='Transfer'`, set `category_source='rule'`.
3. If multiple matches: skip pairing; flag in `app_events` for manual review.

### `pair_refund`

Body: `{transaction_id}`

1. Only consider txs with `amount < 0` (a credit on a credit card or refund).
2. Look for prior tx on the **same account**, **same merchant_name** (normalized), **abs(amount) = abs(refund.amount)** exactly, within last 30 days, not already refunded.
3. If exactly one match: set `is_refund=true` on the negative tx, set `refund_pair_id` bidirectionally on both, set `user_category='Refund'` on the negative tx.
4. Otherwise: leave standalone with whatever the categorizer decided.

### `send_wa_notification`

Body: `{transaction_id, variant: 'new' | 're-notify'}`

1. Load tx. If `is_transfer=true` and `variant='new'`, skip (silent).
2. Build template payload: `{amount: $X.XX, merchant: "...", category: "..."}`.
3. Call Twilio `messages.create` with template SID + variables. (In sandbox: send free-form message — sandbox skips template enforcement.)
4. Insert `whatsapp_messages` row (direction='outbound', `related_transaction_id`, `twilio_message_sid`).
5. Update `transactions.last_notified_at = now()`, `notified_amount = current amount`.
6. On Twilio failure: throw to retry. Final failure → write to `app_events`.

### `parse_wa_reply`

Body: `{whatsapp_message_id}`

1. Load inbound `whatsapp_messages` row.
2. Match transaction:
   a. If `in_reply_to_sid` set → look up outbound `whatsapp_messages` by `twilio_message_sid` → use `related_transaction_id`.
   b. Else: find user's most recent transaction with `last_notified_at` within last 60 minutes AND `last_user_edit_at IS NULL`. If exactly one, use it.
   c. Else: send "Which transaction? Quote the message you want to update." and exit.
3. Download all media URLs (`MediaUrl0..N`). Auth Twilio download with basic auth (account SID + auth token). Upload to Supabase Storage `receipts/<user_id>/<tx_id>/<uuid>.<ext>`. Insert `transaction_attachments` rows.
4. If body is non-empty: call Claude Haiku with intent prompt (see `04-categorization.md`). Returns `{intent, ...}`.
5. Apply intent:
   - `recategorize` → update `user_category`, `category_source='manual'`, upsert `category_rules`.
   - `split` → update `split_type`, `split_value`, `split_raw_input`, recompute `effective_amount`. (split_value resolution: percent→0-100, fixed→dollars, ratio→fraction 0-1.)
   - `note` → append to `notes`.
   - `exclude` → set `excluded_from_stats=true`.
   - `photo` → already attached; just acknowledge.
   - `unknown` → ask for clarification.
6. Update inbound `whatsapp_messages.intent`, `parsed_payload`, `related_transaction_id`.
7. Send free-form confirmation message via Twilio. Log it as outbound.

### `snapshot_balances`

Body: `{}`

1. For each `plaid_items` with status='active', decrypt token, call `accountsBalanceGet`.
2. Update `accounts.current_balance` / `available_balance`.
3. For each account, upsert `balance_snapshots(account_id, date=today)`.

### `notify_item_error`

Body: `{plaid_item_id, error_code}`

1. Send WA message: `⚠️ {institution_name} needs reattention ({error_code}). Reconnect at {APP_URL}/accounts.`

### Dead-letter handler

`POST /api/qstash/dlq` — QStash posts here after final retry. Insert `app_events` row, optionally WhatsApp critical-failure alert.

---

## Cron handlers

cron-job.org calls these with `Authorization: Bearer ${CRON_SECRET}`. Each handler verifies and enqueues the corresponding job.

| Path | Schedule | Action |
|---|---|---|
| `/api/cron/snapshot-balances` | daily 03:00 | enqueue `snapshot_balances` |
| `/api/cron/sync-fallback` | hourly | enqueue `sync_plaid_item` for items where `last_synced_at < now() - interval '90 minutes'` |

---

## Retry policy

| Job | Retries | Backoff |
|---|---|---|
| `sync_plaid_item` | 5 | exp: 30s, 2m, 8m, 32m, 2h |
| `categorize_transaction` | 3 | 30s, 2m, 8m |
| `send_wa_notification` | 5 | 30s, 1m, 5m, 30m, 2h |
| `parse_wa_reply` | 3 | 30s, 2m, 8m |
| `snapshot_balances` | 2 | 5m |
| `notify_item_error` | 3 | 1m, 10m, 1h |

QStash supports per-publish overrides; we pass these via `Upstash-Retries` header.

---

## Idempotency

All workers must be safe to invoke twice. Strategies:

| Job | Idempotency key | Skip-if-already-done check |
|---|---|---|
| `sync_plaid_item` | `(plaid_item_id, current_cursor)` | If cursor advanced beyond what we'd resume from, skip. Otherwise sync is naturally idempotent (Plaid's cursor is the source of truth). |
| `categorize_transaction` | `transaction_id` | If `category_source IS NOT NULL`, skip (unless force flag). |
| `send_wa_notification` | `(transaction_id, variant)` | Check for existing `whatsapp_messages` with `related_transaction_id` and `template_name` matching variant within last 24h. |
| `parse_wa_reply` | `whatsapp_message_id` | If `intent IS NOT NULL`, skip. |
| `snapshot_balances` | `date` | Unique constraint `(account_id, date)` makes upsert safe. |

---

## Error handling principles

- **Webhook routes return 200 fast.** Even if the underlying work fails, ack the upstream immediately to avoid cascading retries.
- **Workers throw on transient failures** (network, 5xx). Let QStash retry.
- **Workers don't throw on logical failures** (invalid input, business-rule violation). Log to `app_events` and return 200.
- **Anthropic outage**: degrade gracefully — set `user_category = NULL`, `category_source = NULL`, send WA notification with category "(uncategorized)". User can fix manually. Re-enqueue categorize for retry.
- **Twilio outage**: notification queue retries; final failure logs to `app_events`. Web UI still works.
- **Plaid outage**: webhooks queue up at Plaid's side and replay when we're back. Fallback cron catches misses.
