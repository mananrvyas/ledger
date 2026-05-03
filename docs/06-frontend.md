# 06 — Frontend

Single-user web dashboard. Goal: show what was spent, on what, when, with the same edit power as WhatsApp plus richer filters and charts.

## Stack details

- **Next.js 15+ app router**, TypeScript, React 19.
- **Server components by default**, client components for interactivity (charts, filters, edit dialogs).
- **Supabase JS client (`@supabase/ssr`)** for queries and Realtime subscriptions.
- **shadcn/ui + Tailwind v4** for primitives.
- **Recharts** for charts.
- **lucide-react** for icons.
- **`sonner`** for toasts.
- **`date-fns`** for date math.
- **No global state library**. URL params for filters, server actions / route handlers for mutations. `tanstack/react-query` only if mutation orchestration becomes painful.

## File structure

```
app/
  layout.tsx
  globals.css
  (auth)/
    login/page.tsx                       # email + password
    signup/page.tsx
  (app)/
    layout.tsx                           # sidebar + auth guard
    page.tsx                             # /dashboard (root)
    transactions/page.tsx
    transactions/[id]/page.tsx           # detail / edit
    categories/page.tsx
    accounts/page.tsx
    settings/page.tsx
    admin/health/page.tsx                # gated to your user
  api/
    plaid/...
    whatsapp/...
    qstash/job/[type]/route.ts
    cron/...
    transactions/...
    categories/...
    accounts/...
    stats/...
    me/route.ts
components/
  ui/                                    # shadcn primitives
  app/
    transaction-row.tsx
    category-pill.tsx
    category-picker.tsx
    split-dialog.tsx
    date-range-picker.tsx
    amount.tsx
    plaid-link-button.tsx
    realtime-listener.tsx
  charts/
    spending-by-category.tsx
    spending-over-time.tsx
    net-worth.tsx
lib/
  supabase/
    client.ts          # browser client
    server.ts          # server client (RSC + route handlers)
    middleware.ts      # session refresh
  plaid.ts
  twilio.ts
  anthropic.ts
  qstash.ts
  encryption.ts
  categorize.ts
  intent.ts
  format.ts            # currency, date helpers
  types.ts
middleware.ts
supabase/
  migrations/
  seed.sql
```

---

## Pages

### `/login` and `/signup`

Standard email/password forms. Supabase Auth `signInWithPassword` / `signUp`. Redirect to `/` on success. Show errors inline. No magic link, no Google OAuth.

### `/` — Dashboard

Grid of cards. Server-component shell, client components for interactive bits.

**Top row:**
- **Spent this month** — big number, with comparison to last month (`+X% vs Apr`).
- **Net worth** — big number with delta over last 30 days.

**Charts:**
- **Spending by category** (donut). Click a slice → drills into that category in `/transactions`.
- **Spending over time** (bar chart, daily for current month). Hover for tooltip.
- **Net worth over time** (line chart, last 90 days from `v_net_worth_daily`).

**Recent transactions** (last 20):
- Reuses `<TransactionRow>` (see components).
- Realtime: subscribe to `transactions` changes; new rows animate in at the top.

**Empty state** when no banks connected:
- Single CTA card: "Connect your first account" → opens Plaid Link.
- Hide all charts.

### `/transactions`

Full filterable list. Server-component shell reads filters from URL params, fetches from `/api/transactions`. Client components handle edits and filter UI.

**Filters (in a sticky toolbar):**
- Date range (default: this month). `date-range-picker.tsx`.
- Category (multi-select). `category-picker.tsx`.
- Account (multi-select).
- Search box (merchant name, fuzzy via pg_trgm).
- Toggles: `Pending only`, `Hide transfers`, `Has note`, `With attachment`.

**List:**
- Virtualized list if scaling matters (probably not for one user; defer).
- Each row: date, account mask, merchant, category pill, amount, attachment indicator.
- Click → opens `/transactions/[id]` in a side panel (or full page on mobile).

**Bulk actions** (select multiple via checkboxes):
- Recategorize bulk → applies to all selected, persists rules per merchant.
- Mark as transfer → manual override.
- Exclude from stats.

### `/transactions/[id]`

Detail view / edit panel.

- All fields visible: date, authorized date, merchant, account, plaid_category, ai_category, user_category, source, amount, effective_amount, split details, notes.
- Inline edit for `user_category`, `split`, `notes`, `excluded_from_stats`.
- Attachments grid — thumbnails with signed URLs. Click to open full-size in a lightbox.
- "Show raw Plaid data" collapsible — pretty-printed `raw` jsonb. Useful debugging affordance.
- WhatsApp conversation log — all `whatsapp_messages` with `related_transaction_id = this`, in order, in a chat-bubble style.

### `/categories`

Manage taxonomy.

- Drag-to-reorder (sets `sort_order`).
- Inline rename (PATCH on blur).
- Color picker, icon picker.
- "Merge into..." — moves transactions and rules from category A to category B, then deletes A.
- "Add category" button — modal with name/color/icon.
- System-default categories show a small badge but can still be edited.

### `/accounts`

Connected items + accounts.

- Each Plaid item card:
  - Institution name + logo (from Plaid).
  - Status pill (active / requires_login / error / disconnected).
  - List of accounts with current balances.
  - Last synced timestamp.
  - "Reconnect" button if `status = 'requires_login'` → opens Plaid Link in update mode.
  - "Sync now" button → calls `/api/plaid/sync`.
  - "Disconnect" with confirmation modal.
- "Connect new account" button → `<PlaidLinkButton />`.

### `/settings`

- Profile (email — read-only, change via Supabase).
- Password change.
- WhatsApp number on file (display only — single-user app, hardcoded in env).
- Encryption passphrase status (set / unset — never display).
- Export data (download all transactions as CSV / JSON).
- Danger zone: disconnect all banks, delete all data.

### `/admin/health`

Gated to your user (hardcoded check via email or user_id allowlist env var).

- Plaid items table: institution, status, last synced, last webhook, error.
- Webhook stats (last 24h): Plaid received / processed / failed; Twilio received / replied.
- Queue stats (last 24h, from QStash API): job types, success/fail counts.
- Categorization mix chart (last 30 days, % per source).
- Recent `app_events` of type `job_failed`, `ambiguous_transfer_pair`, `ambiguous_refund_pair`.
- Action: "Re-sync all items now" button.

---

## Key components

### `<TransactionRow>`

```
[date] [merchant_name]                [amount]
       [account mask] [category pill]
```

- Bold/large amount on credit cards (debits), green for credits.
- Hover reveals quick actions: edit category, split, exclude.
- Click opens detail.
- Strikethrough if `excluded_from_stats=true`. Linked-icon if part of transfer/refund pair (hover shows the paired tx).

### `<CategoryPill>`

Background = category color (low opacity). Icon + name. Small.

### `<CategoryPicker>`

Combobox using `cmdk`. Fuzzy search across user's categories. Shows icon + name. Keyboard friendly. "Create new category" option at the bottom.

### `<SplitDialog>`

Three input modes (tabs):
- **Percent** — slider 0-100, also numeric input.
- **Fixed amount** — dollar input, validated < total.
- **Ratio** — text input parsed via regex (e.g., `1/3`, `2/5`).

Shows live preview: "Your share: $X.XX of $Y.YY".

Free-text raw input is preserved (`split_raw_input`) for transparency.

### `<PlaidLinkButton>`

Wraps `react-plaid-link`. Calls `/api/plaid/link/create-token` to fetch token, opens Plaid Link, on success calls `/api/plaid/link/exchange`.

Props: `mode = 'add' | 'update'` and optional `plaid_item_id` for reconnect.

### `<RealtimeListener>` (mounted in `(app)/layout.tsx`)

Client component that subscribes to:

```ts
supabase.channel('transactions:user-' + userId)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'transactions',
    filter: `user_id=eq.${userId}`,
  }, handler)
  .subscribe();
```

Handler dispatches React Query / SWR cache invalidations or pushes events into a context that pages consume to refresh.

Same for `accounts` (balance updates) and `whatsapp_messages` (live conversation in detail view).

---

## State management

- **Read state:** Server components fetch via `@supabase/ssr` server client. Filters via URL params (so back/forward + share URLs work).
- **Write state:** Route handlers (POST/PATCH/DELETE) with form actions in client components. Toast on success/error via `sonner`.
- **Realtime:** Supabase Realtime channels at the layout level. Pages subscribe to specific tables they care about; the listener invalidates query caches or appends to in-memory lists.

No Redux. No Zustand. Reach for `tanstack/react-query` only when the imperative mutation flow gets painful (likely once we add bulk operations).

---

## Empty states

| Page | Empty | Treatment |
|---|---|---|
| Dashboard | No banks connected | One CTA: connect first bank. Charts hidden. |
| Dashboard | Banks connected but no txs yet | "Syncing your transactions — first sync can take a minute." Auto-refresh on Realtime insert. |
| Transactions | Filter returns 0 | "No matching transactions. Adjust filters." |
| Categories | (n/a, defaults always present) | — |
| Accounts | No items | Single CTA. |
| Settings | — | — |

---

## Realtime usage

| Page | Subscribes to | What happens |
|---|---|---|
| Dashboard | `transactions` (insert + update) | Recent list prepends; charts refresh on new posted tx (debounced) |
| Transactions | `transactions` (insert + update + delete) | List reflects changes immediately |
| Transaction detail | `transactions` for this id, `whatsapp_messages` for `related_transaction_id` | Live edit reflection; conversation appends in real time |
| Accounts | `accounts` (update) and `plaid_items` (update) | Balance updates and status changes appear without refresh |
| Health | `app_events` insert | New error rows appear |

---

## Accessibility / mobile

- All interactive elements keyboard accessible (shadcn primitives are good defaults).
- Mobile sidebar collapses to drawer (lucide hamburger).
- Touch-friendly hit targets on transaction rows.
- Charts have screen-reader summaries (role + ARIA label with category totals).
- Don't break on small screens — most usage will be from your phone in the same browser window where you're reading WhatsApp.

---

## Performance

- One user, low scale — performance is rarely the gating factor.
- That said:
  - Indexes on `(user_id, date desc)` make transaction queries fast even at 50k+ rows.
  - Net worth chart uses the materialized-via-snapshots pattern, so it's an O(days × accounts) lookup, not aggregating transactions.
  - Realtime subscriptions are scoped to user's rows by RLS-aware filters, so payload size stays small.
- Defer virtualization, ISR, and other Next.js perf knobs unless we hit a real problem.
