-- 0010 — Exclude archived-account rows from v_spending
--
-- Context: after a Plaid re-link, the old item can be left soft-disconnected
-- with its accounts archived (is_archived = true) but its transactions kept.
-- The transaction-list surfaces were fixed in app code to constrain to active
-- accounts, but v_spending (which the dashboard aggregates) was not archived-
-- aware, so a future soft-disconnect of an item WITH live tx would double-count
-- in dashboard spend. This adds a join to accounts + `a.is_archived = false`.
--
-- Body reconciled against the live definition (pg_get_viewdef). The ONLY change
-- vs. the previous view is `join accounts a ... and a.is_archived = false`;
-- every other clause (effective_amount alias, amount > 0 outflow filter,
-- COALESCE category exclusion, column order) is preserved byte-for-byte.
-- security_invoker is re-declared so the RLS behaviour is unchanged.
--
-- Expected impact: none today (no archived account currently has live tx).
-- Baseline before applying: 539 rows, sum(amount) = 75995.90.

create or replace view public.v_spending
with (security_invoker = on) as
select
  t.id,
  t.user_id,
  t.account_id,
  t.date,
  t.merchant_name,
  t.user_category,
  t.effective_amount as amount,
  t.split_type,
  t.notes
from transactions t
join accounts a on a.id = t.account_id
where t.deleted_at is null
  and a.is_archived = false                                        -- ← the fix
  and t.is_pending = false
  and t.is_transfer = false
  and t.excluded_from_stats = false
  and t.amount > 0::numeric
  and (coalesce(t.user_category, ''::text) <> all
       (array['Income'::text, 'Transfer'::text, 'Refund'::text]));
