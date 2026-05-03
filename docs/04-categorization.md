# 04 — Categorization

The "intelligence" layer. Turns raw Plaid transactions into categorized, paired, splittable rows the user actually wants to see.

## Goals

1. **Get it right most of the time without asking.** User explicitly chose "always guess, never ask."
2. **Learn from every correction.** Each WhatsApp / web edit becomes a future free pass for that merchant.
3. **Be cheap.** Plaid is free; rules are free; only fall to LLM when necessary.
4. **Be transparent.** Every transaction records *which layer won* (`category_source`).

---

## The waterfall

For each new transaction:

```
┌────────────────────────────────────────────────┐
│ 1. Plaid says HIGH or VERY_HIGH confidence?    │ → use it. category_source='plaid'
├────────────────────────────────────────────────┤
│ 2. category_rules has a match for normalized   │
│    merchant_pattern?                            │ → use it. category_source='rule'.
│                                                 │   increment times_applied.
├────────────────────────────────────────────────┤
│ 3. Call Claude Haiku                            │ → use result. category_source='ai'.
│    (batched per sync if multiple uncategorized) │
├────────────────────────────────────────────────┤
│ Fallback: 'Other' if everything fails           │ → category_source='ai', confidence=0.0
└────────────────────────────────────────────────┘
```

User edits later (web or WhatsApp) → `category_source='manual'` and `category_rules` upsert.

### Plaid confidence mapping

Plaid returns `personal_finance_category.confidence_level ∈ {VERY_HIGH, HIGH, MEDIUM, LOW, UNKNOWN}`. We trust only `VERY_HIGH` and `HIGH`. Everything else falls to the rules / LLM layer.

We map Plaid's snake-case primary categories to our taxonomy:

| Plaid primary | Our category |
|---|---|
| `INCOME` | Income |
| `TRANSFER_IN` / `TRANSFER_OUT` | Transfer |
| `LOAN_PAYMENTS` | Fees |
| `BANK_FEES` | Fees |
| `ENTERTAINMENT` | Entertainment |
| `FOOD_AND_DRINK` | Eating Out (overridden to Coffee or Groceries by detail-level subcategory: `FOOD_AND_DRINK_COFFEE` → Coffee, `FOOD_AND_DRINK_GROCERIES` → Groceries) |
| `GENERAL_MERCHANDISE` | Shopping |
| `HOME_IMPROVEMENT` | Shopping |
| `MEDICAL` / `HEALTHCARE` | Health |
| `PERSONAL_CARE` | Personal Care |
| `GENERAL_SERVICES` | Other |
| `GOVERNMENT_AND_NON_PROFIT` | Other |
| `TRANSPORTATION` | Transit |
| `TRAVEL` | Travel |
| `RENT_AND_UTILITIES` | Rent (or Utilities by detail subcategory) |
| `RECREATION` | Entertainment |
| `EDUCATION` | Other |

Mapping table lives in `lib/plaid-category-map.ts`.

### Merchant normalization

Used both for category_rules lookup and for fuzzy matching:

```ts
function normalizeMerchant(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 &\-']/g, '')   // strip punctuation
    .replace(/\s+#\d+\s*$/, '')        // remove trailing store numbers like "Starbucks #4521"
    .replace(/\s+\d{3,}$/, '')         // remove other trailing digits
    .trim();
}
```

This lets "STARBUCKS #4521" and "starbucks 1234" both match a rule keyed on `starbucks`.

---

## Rules learning

Every time `user_category` changes via PATCH or WhatsApp:

```sql
insert into category_rules (user_id, merchant_pattern, category_name, source)
values ($user, $pattern, $new_category, 'manual')
on conflict (user_id, merchant_pattern) do update set
  category_name = excluded.category_name,
  times_applied = category_rules.times_applied + 1,
  updated_at = now();
```

Latest user choice wins. We never silently override the user.

If `merchant_name` is null on the transaction (rare but happens), no rule is written — there's nothing to key on.

---

## LLM categorization (when waterfall reaches step 3)

### Model

Claude Haiku via Anthropic SDK. JSON-mode via tool use or response_format.

### When called

- Inside `categorize_transaction` worker, after Plaid + rules miss.
- Batched per sync: if a `sync_plaid_item` produced 12 new uncategorized transactions, the worker emits 12 individual `categorize_transaction` jobs **but**, as an optimization, the first job that runs after a sync can pull all currently-uncategorized txs for that user and categorize them in a single LLM call. (Optimization optional — straightforward to start with one-at-a-time and profile.)

### Prompt structure

System:
```
You are a precise financial transaction categorizer.

Rules:
- Output VALID JSON only. No prose.
- Choose the best match from the provided category list.
- If no provided category fits well, output category="Other".
- Never invent category names that aren't in the list.
- Confidence is your honest 0.0–1.0 estimate.
```

User (filled with current user's category list and tx batch):
```
Available categories: ["Groceries","Eating Out","Coffee","Transit",...]

Transactions:
1. Merchant: "BLUE BOTTLE COFFEE", Amount: $5.50, Date: 2026-05-03, PlaidHint: FOOD_AND_DRINK
2. Merchant: "AMZN MKTPL US*1234", Amount: $42.10, Date: 2026-05-03, PlaidHint: GENERAL_MERCHANDISE

Return JSON:
{
  "results": [
    {"index": 1, "category": "...", "confidence": 0.0-1.0, "reasoning": "one short sentence"},
    ...
  ]
}
```

Plaid's category is included as a *hint* to disambiguate (e.g., AMZN at a bookstore vs AMZN groceries).

### Output validation

- Parse JSON.
- For each result: assert category is in the user's list. If not, replace with "Other".
- If parse fails: log error, return `Other` for the whole batch, don't throw (Anthropic outages are transient — retry job).
- If `confidence < 0.4`, still apply but flag in `app_events` for the health page (visibility into LLM quality).

---

## Transfer pairing

Runs synchronously at the end of `categorize_transaction` (not as a separate queue job — avoids the race where WA notification ships before pairing completes).

### Algorithm

```
input: tx T with amount A, account X, date D, user U

candidate_set = transactions where:
  user_id = U
  AND account_id != X
  AND deleted_at IS NULL
  AND ABS(amount + A) < 0.01           -- equal magnitude, opposite sign
  AND ABS(date - D) <= 3                -- within 3 days
  AND is_transfer = false               -- not already paired

if candidate_set.size == 1:
  pair = candidate_set[0]
  set T.is_transfer = true, T.transfer_pair_id = pair.id, T.user_category = 'Transfer', T.category_source = 'rule'
  set pair.is_transfer = true, pair.transfer_pair_id = T.id, pair.user_category = 'Transfer', pair.category_source = 'rule'

elif candidate_set.size == 0:
  no-op

else:  # multiple matches
  log app_events: ambiguous_transfer_pair
  no-op
```

Pairing wipes any prior category — including if Plaid had said "Shopping" with high confidence. Transfer detection wins.

If a transfer pairing happens *after* a WhatsApp notification was sent for the original tx, we **don't** re-send. The user can see the corrected category in the dashboard. (Sending "actually that was a transfer" notifications would be noisy.)

---

## Refund pairing

Runs as `pair_refund` job after categorize.

### Algorithm

```
input: tx T with amount A < 0, account X, merchant M (normalized), date D, user U

if T.amount >= 0: exit  # not a candidate

candidate_set = transactions where:
  user_id = U
  AND account_id = X                                 -- same account
  AND deleted_at IS NULL
  AND amount > 0                                      -- the original purchase
  AND ABS(amount - ABS(A)) < 0.01                    -- exact magnitude match
  AND normalize(merchant_name) = M                    -- same merchant
  AND date BETWEEN D - 30 AND D                       -- within 30 days prior
  AND is_refund = false
  AND refund_pair_id IS NULL

if candidate_set.size == 1:
  pair = candidate_set[0]
  set T.is_refund = true, T.refund_pair_id = pair.id, T.user_category = 'Refund'
  set pair.refund_pair_id = T.id            -- but pair is NOT marked is_refund (that flag is only for the credit)

elif candidate_set.size == 0:
  leave T standalone with whatever the categorizer assigned (often 'Refund' from Plaid hints, or 'Other')

else:
  log app_events: ambiguous_refund_pair
  no-op
```

Refunds where amounts differ (partial refunds, restocking fees) are *not* auto-paired in v1. They show as standalone negative-amount transactions. User can manually link them later (phase 6 enhancement).

The original purchase keeps its category (so spending stats already handled the refund correctly via subtraction once both rows exist; the `effective_amount` on the original purchase doesn't change). To net-out for stats, the `v_spending` view excludes refund-paired pairs in a future iteration if it becomes a problem; for now, both rows show.

---

## Pending → Posted re-notification

When `sync_plaid_item` processes a `modified` transaction and detects pending→posted transition:

```
old_amount = transactions.notified_amount  (snapshotted at notification time)
new_amount = plaid_modified.amount
old_category = transactions.user_category at time of last notification
new_category = current category after re-running waterfall

amount_changed = old_amount IS NOT NULL AND
                 ABS(new_amount - old_amount) / NULLIF(old_amount, 0) > 0.05

category_changed = old_category != new_category

if was_pending AND now_posted AND (amount_changed OR category_changed):
  enqueue send_wa_notification(transaction_id, variant='re-notify')
```

Re-notify template variant explicitly says "Updated: was $X, now $Y" so it's clear.

The `notified_amount` column is set when the *original* notification ships. We only update it on re-notify, not on every sync, so we always compare to what the user last saw.

---

## "Always guess" policy

Decisions implied by this policy:

- No "uncertain — please choose" prompts. Even at confidence 0.0, we commit a category (default: "Other").
- The WhatsApp notification always includes the assigned category, never "?".
- Low-confidence categorizations are still tracked in `ai_confidence` so the health page can surface "your AI is bad at X" patterns over time.
- The user IS the threshold check, via WhatsApp reply.

---

## Visibility / metrics

Track these in the health page (see `01-architecture.md`):

- **Categorization mix** over last 30 days: % from each `category_source`.
  - Healthy ratios: ~50% plaid, ~30% rule, ~15% ai, ~5% manual after a few weeks.
  - If `manual` stays high (>15%), the LLM and rules aren't learning fast enough — investigate.
- **Average AI confidence** when `category_source='ai'`. Below 0.6 average suggests prompt or category-list issue.
- **Transfer pairing rate** — out of all detected debits over $X, how many are paired with a credit on another account.
- **Ambiguous pair events** — count of `app_events` entries for ambiguous transfer/refund matches; these need manual review.
