-- 072_add_auto_coupons_uppercase_check.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-15 (20260715103531) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


-- Defense in depth: code normalization (uppercase) happens client-side
-- on both create and lookup, but this constraint means a coupon can
-- never end up stored lowercase via some other path later, which would
-- otherwise silently make it unfindable by the checkout lookup.
ALTER TABLE public.auto_coupons ADD CONSTRAINT auto_coupons_code_uppercase CHECK (code = upper(code));
