# 02 — Database

All schema lives in Supabase Postgres. Migrations managed via the Supabase CLI (`supabase/migrations/`). Every user-scoped table has RLS enabled with `user_id = auth.uid()` policies.

## Conventions

- Primary keys: `uuid` defaulting to `gen_random_uuid()`.
- Timestamps: `created_at` and `updated_at`, both `timestamptz` defaulting to `now()`. `updated_at` maintained by trigger.
- All money amounts: `numeric(14, 2)` (cents resolution, plenty of headroom).
- Currency stored as `text` ISO code (default `'USD'`).
- Soft deletes: `deleted_at timestamptz` rather than DELETE — we never hard-delete financial history.
- Raw external payloads: stored as `jsonb` columns named `raw` (per-row) or in `plaid_webhooks` / `whatsapp_messages` (per-event).
- All FKs `ON DELETE` declared explicitly (`CASCADE` for owned children, `SET NULL` for non-owned).

---

## Tables

### `plaid_items` — one per bank login

```
id                  uuid pk
user_id             uuid fk auth.users  not null
plaid_item_id       text unique not null
institution_id      text
institution_name    text
access_token_enc    bytea         -- encrypted via pgcrypto, never in plaintext column
cursor              text          -- transactionsSync cursor
status              text not null default 'active'   -- 'active' | 'requires_login' | 'error' | 'disconnected'
error_code          text
error_message       text
last_synced_at      timestamptz
last_webhook_at     timestamptz
created_at          timestamptz default now()
updated_at          timestamptz default now()

index on (user_id, status)
index on (last_synced_at)  -- for fallback cron
```

**RLS:** `user_id = auth.uid()` for all CRUD.

Access token is written/read only via pgcrypto helper functions:
```sql
create or replace function store_plaid_item(
  p_user_id uuid, p_access_token text, p_item_id text,
  p_institution_name text, p_institution_id text, p_passphrase text
) returns plaid_items as $$ ... $$ language plpgsql security definer;

create or replace function get_plaid_access_token(
  p_item_id uuid, p_passphrase text
) returns text as $$ ... $$ language plpgsql security definer;
```
Both functions verify the caller is the owner before encrypting/decrypting.

---

### `accounts` — accounts inside an item

```
id                  uuid pk
plaid_item_id       uuid fk plaid_items on delete cascade
user_id             uuid fk auth.users  not null
plaid_account_id    text unique not null
name                text not null
official_name       text
mask                text          -- last 4 digits
type                text not null  -- 'depository' | 'credit' | 'investment' | 'loan' | 'other'
subtype             text           -- 'checking' | 'savings' | 'credit_card' | etc.
currency            text default 'USD'
current_balance     numeric(14,2)
available_balance   numeric(14,2)
credit_limit        numeric(14,2)
is_archived         boolean default false
raw                 jsonb         -- full Plaid account object
created_at          timestamptz default now()
updated_at          timestamptz default now()

index on (user_id, is_archived)
index on (plaid_item_id)
```

**RLS:** `user_id = auth.uid()`.

---

### `transactions` — the big one

```
id                       uuid pk
account_id               uuid fk accounts on delete cascade
user_id                  uuid fk auth.users not null
plaid_transaction_id     text unique          -- nullable for future manual entries
amount                   numeric(14,2) not null    -- positive = outflow, matches Plaid convention
currency                 text default 'USD'
date                     date not null            -- posted date
authorized_date          date                     -- when card was actually swiped, if known
merchant_name            text
name                     text                     -- raw description (e.g., "AMZN MKTPL US*XX12")
merchant_logo_url        text
plaid_category           text
plaid_category_detail    text
plaid_confidence         text                     -- 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW'
ai_category              text
ai_confidence            numeric(3,2)
ai_reasoning             text
user_category            text                     -- final category shown in UI
category_source          text                     -- 'plaid' | 'rule' | 'ai' | 'manual'
is_pending               boolean default false
is_transfer              boolean default false
transfer_pair_id         uuid fk transactions(id) on delete set null
is_refund                boolean default false    -- true if pair_refund matched it
refund_pair_id           uuid fk transactions(id) on delete set null
split_type               text default 'none'      -- 'none' | 'percent' | 'fixed' | 'ratio'
split_value              numeric(14,4)            -- meaning depends on split_type
split_raw_input          text                     -- "1/3" or "20%" or "$8" — what user typed
effective_amount         numeric(14,2)            -- computed: see below
split_note               text
notes                    text
excluded_from_stats      boolean default false
last_user_edit_at        timestamptz
last_notified_at         timestamptz              -- when WA message was sent
notified_amount          numeric(14,2)            -- amount at time of notification, for re-notify Δ check
raw                      jsonb                    -- full Plaid transaction object
deleted_at               timestamptz
created_at               timestamptz default now()
updated_at               timestamptz default now()

index on (user_id, date desc)
index on (account_id, date desc)
index on (user_category)
index on (is_pending) where is_pending = true
index on (deleted_at) where deleted_at is null
index on (merchant_name) using gin (merchant_name gin_trgm_ops)  -- enable pg_trgm extension
unique (plaid_transaction_id) where plaid_transaction_id is not null
```

**`effective_amount` computation:**
```
none    : effective_amount = amount
percent : effective_amount = amount * (split_value / 100)
fixed   : effective_amount = split_value                       (the share you actually paid)
ratio   : effective_amount = amount * split_value              (split_value stores the resolved fraction, e.g., 1/3 = 0.3333)
```
Maintained either as a generated column (`GENERATED ALWAYS AS (...) STORED`) — preferred — or kept in sync via trigger if generated columns can't reference other columns we need.

**RLS:** `user_id = auth.uid()`.

---

### `transaction_attachments` — receipt photos etc.

```
id                  uuid pk
transaction_id      uuid fk transactions on delete cascade
user_id             uuid fk auth.users not null
storage_path        text not null         -- path in Supabase Storage 'receipts' bucket
mime_type           text
size_bytes          bigint
source              text                  -- 'whatsapp' | 'web_upload'
twilio_media_url    text                  -- original Twilio URL if from WhatsApp
created_at          timestamptz default now()

index on (transaction_id)
```

**RLS:** `user_id = auth.uid()`. Storage bucket `receipts` is private; signed URLs only.

---

### `categories` — taxonomy

```
id          uuid pk
user_id     uuid fk auth.users          -- nullable for system defaults
name        text not null
parent_id   uuid fk categories on delete set null
color       text         -- hex
icon        text         -- lucide icon name
is_default  boolean default false
sort_order  integer default 0
created_at  timestamptz default now()

unique (user_id, name)   -- per-user uniqueness; nulls treated as distinct
index on (user_id, sort_order)
```

**RLS:** `(user_id = auth.uid()) OR (is_default = true AND user_id IS NULL)` for SELECT; mutations require `user_id = auth.uid()`.

---

### `category_rules` — learned merchant→category

```
id                  uuid pk
user_id             uuid fk auth.users not null
merchant_pattern    text not null     -- normalized: lowercase, trimmed, single-spaced
category_name       text not null
confidence          numeric(3,2) default 1.0
times_applied       integer default 0
last_applied_at     timestamptz
source              text default 'manual'  -- 'manual' (user correction) | 'inferred'
created_at          timestamptz default now()
updated_at          timestamptz default now()

unique (user_id, merchant_pattern)
index on (user_id, merchant_pattern)
```

**RLS:** `user_id = auth.uid()`.

When a user recategorizes via web UI or WhatsApp, upsert by `(user_id, merchant_pattern)` — if exists, increment `times_applied` and set `category_name` to the new value (latest wins).

---

### `whatsapp_messages` — full WA conversation log

```
id                       uuid pk
user_id                  uuid fk auth.users not null
direction                text not null     -- 'outbound' | 'inbound'
twilio_message_sid       text unique
provider_message_id      text              -- WA-platform-level wamid (used for quote-reply matching)
in_reply_to_sid          text              -- Twilio's OriginalRepliedMessageSid for quoted replies
in_reply_to_wamid        text              -- if Twilio surfaces quoted-message wamid
body                     text
related_transaction_id   uuid fk transactions(id) on delete set null
intent                   text              -- 'split' | 'recategorize' | 'note' | 'exclude' | 'photo' | 'unknown'
parsed_payload           jsonb             -- full LLM output for inbound
status                   text default 'pending'  -- 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
error                    text
template_name            text              -- for outbound templates, the template identifier
raw                      jsonb             -- full Twilio webhook payload
created_at               timestamptz default now()
updated_at               timestamptz default now()

index on (user_id, created_at desc)
index on (related_transaction_id)
index on (twilio_message_sid)
```

**RLS:** `user_id = auth.uid()`.

---

### `balance_snapshots` — daily account balances

```
id                  uuid pk
account_id          uuid fk accounts on delete cascade
user_id             uuid fk auth.users not null
date                date not null
current_balance     numeric(14,2)
available_balance   numeric(14,2)
taken_at            timestamptz default now()

unique (account_id, date)
index on (user_id, date)
```

**RLS:** `user_id = auth.uid()`.

---

### `plaid_webhooks` — raw inbound webhook log

```
id              uuid pk
user_id         uuid fk auth.users     -- resolved at process time, nullable initially
webhook_type    text not null          -- 'TRANSACTIONS' | 'ITEM' | 'AUTH' | etc.
webhook_code    text not null          -- 'SYNC_UPDATES_AVAILABLE' | 'DEFAULT_UPDATE' | etc.
plaid_item_id   text                   -- raw item_id string from Plaid
item_uuid       uuid fk plaid_items(id) on delete set null
payload         jsonb not null
processed       boolean default false
processed_at    timestamptz
error           text
received_at     timestamptz default now()

index on (processed, received_at)
index on (item_uuid, received_at desc)
```

**RLS:** none (service-role only). Not exposed to client.

We store every single payload, processed or not, regardless of outcome. Lets us replay missed events and audit data lineage.

---

### `app_events` — generic event log

```
id           uuid pk
user_id      uuid fk auth.users
event_type   text not null    -- 'job_failed' | 'item_reconnected' | 'category_changed' | etc.
payload      jsonb
created_at   timestamptz default now()

index on (user_id, event_type, created_at desc)
```

**RLS:** `user_id = auth.uid()` for SELECT. Inserts via service role.

---

## Views

### `v_spending` — single source of truth for "spending"

```sql
create view v_spending as
select
  t.id, t.user_id, t.account_id, t.date,
  t.merchant_name, t.user_category,
  t.effective_amount as amount,
  t.split_type, t.notes
from transactions t
where t.deleted_at is null
  and t.is_pending = false
  and t.is_transfer = false
  and t.excluded_from_stats = false
  and t.amount > 0
  and coalesce(t.user_category, '') not in ('Income', 'Transfer', 'Refund');
```

All dashboard "what did I spend" queries go through this view. Change the rule once.

### `v_net_worth_daily` — daily net worth from snapshots

```sql
create view v_net_worth_daily as
select
  bs.user_id,
  bs.date,
  sum(
    case
      when a.type in ('depository', 'investment') then bs.current_balance
      when a.type in ('credit', 'loan') then -coalesce(bs.current_balance, 0)
      else 0
    end
  ) as net_worth
from balance_snapshots bs
join accounts a on a.id = bs.account_id
where a.is_archived = false
group by bs.user_id, bs.date;
```

---

## Default categories (seed data)

Inserted with `user_id = NULL` and `is_default = true`. User can edit in their own override row, but we keep these as the floor.

| # | Name | Color | Icon (lucide) |
|---|---|---|---|
| 1 | Groceries | `#16a34a` | `shopping-cart` |
| 2 | Eating Out | `#f97316` | `utensils` |
| 3 | Coffee | `#92400e` | `coffee` |
| 4 | Transit | `#0ea5e9` | `bus` |
| 5 | Travel | `#6366f1` | `plane` |
| 6 | Rent | `#7c3aed` | `home` |
| 7 | Utilities | `#0891b2` | `bolt` |
| 8 | Subscriptions | `#db2777` | `repeat` |
| 9 | Shopping | `#ec4899` | `shopping-bag` |
| 10 | Health | `#dc2626` | `heart-pulse` |
| 11 | Entertainment | `#a855f7` | `film` |
| 12 | Personal Care | `#f59e0b` | `sparkles` |
| 13 | Fitness | `#10b981` | `dumbbell` |
| 14 | Gifts | `#e11d48` | `gift` |
| 15 | Fees | `#475569` | `receipt` |
| 16 | Income | `#059669` | `arrow-down-circle` |
| 17 | Transfer | `#64748b` | `arrow-left-right` |
| 18 | Refund | `#0d9488` | `undo-2` |
| 19 | Other | `#71717a` | `circle` |

`Income`, `Transfer`, `Refund` are special — they're excluded from spending stats by the `v_spending` view.

---

## Extensions to enable

```sql
create extension if not exists pgcrypto;       -- token encryption
create extension if not exists pg_trgm;        -- merchant name fuzzy search
create extension if not exists "uuid-ossp";    -- if not relying on pgcrypto's gen_random_uuid
```

---

## Migration approach

- All schema changes via numbered migration files in `supabase/migrations/`.
- Supabase MCP `apply_migration` handles them in dev; promote to prod by running the same SQL.
- Seed data (default categories) lives in a separate `supabase/seed.sql` run only on fresh DBs.
- Never edit a migration after it's been applied to prod — write a new one.
