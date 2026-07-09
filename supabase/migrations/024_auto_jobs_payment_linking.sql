-- 024_auto_jobs_payment_linking.sql
--
-- Applied live via Supabase MCP on 2026-07-09 (migration version
-- 20260709054641, name "auto_jobs_payment_linking") but never committed
-- to this repo -- discovered as orphaned schema drift during the
-- 2026-07-09 audit (no migration file, no commit, no application code
-- anywhere referencing either column). This file is the exact text that
-- was run, added now purely to close the repo/live gap. No new live
-- schema change; both columns already exist in production.
--
-- Additive, nullable -- no existing query (POS or Auto) is affected.
--
-- Note: neither column has a consumer yet. auto_jobs.payment_method is
-- not written by BoardPage.jsx or any other screen; salon_mpesa_payments
-- .job_id is not written by anything either. This is schema laid down
-- ahead of Phase 5 (Payments) work, not a completed feature -- treat it
-- as inert until Phase 5 is actually scoped and greenlit.

alter table public.auto_jobs
  add column payment_method text;

alter table public.salon_mpesa_payments
  add column job_id uuid references public.auto_jobs(id) on delete set null;
