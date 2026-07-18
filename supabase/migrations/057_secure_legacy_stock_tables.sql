-- 057_secure_legacy_stock_tables.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-03 (20260703005653) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.
--
-- CAUTION: this migration references a table that was later dropped by
-- migration 054 or 056 (device_login_events/stock_movements/stock_log/products).
-- It is accurate history but is NOT safely re-runnable after 056 on a fresh
-- database rebuild -- it will error because the target table no longer exists
-- by that point in the sequence. Kept here for audit-trail completeness only.

-- Secures two legacy, pre-multi-tenancy tables (stock_log, stock_movements)
-- confirmed via audit (2026-07-03) to have:
--   - no salon_id column (structurally incompatible with current tenant model)
--   - no triggers, RPCs, or application code referencing them
--   - stock_log: 20 rows, all from a single dev/test session on 2026-06-14
--   - stock_movements: 0 rows, appears to be an abandoned redesign of stock_log
-- Decision: keep data in place, close the RLS gap by enabling RLS with no
-- policies (default-deny). This blocks all anon/authenticated PostgREST
-- access while leaving rows intact for a future decision (drop vs adopt).

ALTER TABLE public.stock_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
