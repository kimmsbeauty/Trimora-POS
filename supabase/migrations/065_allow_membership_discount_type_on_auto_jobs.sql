-- 065_allow_membership_discount_type_on_auto_jobs.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-14 (20260714211218) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


ALTER TABLE public.auto_jobs DROP CONSTRAINT auto_jobs_discount_type_check;
ALTER TABLE public.auto_jobs ADD CONSTRAINT auto_jobs_discount_type_check
    CHECK (discount_type = ANY (ARRAY['pct'::text, 'fixed'::text, 'membership'::text]));
