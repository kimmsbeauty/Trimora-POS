-- 058_remove_public_mpesa_payment_policies.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-03 (20260703062812) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.

-- Removes two mislabeled RLS policies on salon_mpesa_payments.
-- Named "Service role can insert/update payments" but actually granted
-- to {public} (roles column confirmed via pg_policies), meaning any
-- anon-key holder could insert or edit M-Pesa payment records for any
-- salon — a financial fraud vector, not just a data leak.
--
-- Safe to drop: Supabase's service_role key bypasses RLS entirely by
-- design and never needs a policy to write. Whatever backend process
-- handles the actual M-Pesa/Daraja callback already writes fine via
-- service_role regardless of these policies existing. No legitimate
-- traffic depends on them.

DROP POLICY IF EXISTS "Service role can insert payments" ON public.salon_mpesa_payments;
DROP POLICY IF EXISTS "Service role can update payments" ON public.salon_mpesa_payments;
