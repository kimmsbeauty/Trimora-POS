-- 060_secure_customers_public_lookup.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-03 (20260703063514) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.

-- Closes the customers table read leak. Previously "customers_anon_select"
-- (qual: true, role: anon) allowed anyone with the public anon key to
-- read every customer's name/phone/visit history across every salon via
-- a direct REST call (e.g. GET /rest/v1/customers?select=*), bypassing
-- db.js's app-layer salon_id filter entirely, since RLS -- not app code
-- -- is the real security boundary and it was wide open.
--
-- The public booking page is intentionally unauthenticated (a walk-in
-- client has no login), so there's no JWT identity for auth_salon_id()
-- to scope against. Replacing the open table policy with a narrow
-- SECURITY DEFINER RPC preserves the "check if this is a returning
-- customer" feature the booking flow needs, while eliminating the
-- ability to bulk-dump the table -- callers must supply an exact
-- salon_id + phone, one row at a time, same as the app already does.

CREATE OR REPLACE FUNCTION public.public_customer_lookup(p_salon_id uuid, p_phone text)
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.customers
  WHERE salon_id = p_salon_id AND phone = p_phone
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.public_customer_lookup(uuid, text) TO anon, authenticated;

DROP POLICY IF EXISTS "customers_anon_select" ON public.customers;

-- customers_anon_insert (with_check: true) accepted any salon_id in the
-- payload, letting a direct API call attribute a fabricated customer to
-- any salon. Tightened to require the salon_id actually exists -- additive,
-- doesn't change behavior for legitimate app traffic (db.js always sets a
-- real, resolved salon_id), only blocks arbitrary/garbage values.
DROP POLICY IF EXISTS "customers_anon_insert" ON public.customers;
CREATE POLICY "customers_anon_insert" ON public.customers
FOR INSERT TO anon
WITH CHECK (EXISTS (SELECT 1 FROM public.salons WHERE id = customers.salon_id));
