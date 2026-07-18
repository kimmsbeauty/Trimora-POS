-- 061_remove_blanket_stock_expenses_feedback_policies.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-03 (20260703064217) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.

-- Closes the same "blanket policy OR'd with a correct one" pattern on the
-- remaining three tables. Verified via full repo audit before applying:
--
-- stock, expenses: every reference in the codebase is inside POSApp.jsx /
-- ExpensesPage.jsx, reached only via the /:slug/pos route, which is wrapped
-- in <DeviceGate> -- confirmed to block rendering until a real, salon-
-- matched Supabase Auth session exists (see App.jsx DeviceGate component).
-- The legacy unprefixed /pos route these tables' "allow all" policies may
-- once have covered no longer routes to POSApp at all (renders the landing
-- page instead) -- confirmed via current src/App.jsx route table. No
-- legitimate anon traffic depends on either policy.
--
-- feedback: has a genuine anon need (the public rating page at
-- /:slug/rate/:token, unauthenticated by design), already correctly served
-- by the separate feedback_anon_insert policy. "allow all feedback" (cmd:
-- ALL, roles: anon+authenticated, qual: true) is redundant with the
-- correctly-scoped policies for every operation, including SELECT/UPDATE/
-- DELETE which nothing in the app ever performs via anon at all.

DROP POLICY IF EXISTS "allow all stock" ON public.stock;
DROP POLICY IF EXISTS "Allow all for anon" ON public.expenses;
DROP POLICY IF EXISTS "allow all feedback" ON public.feedback;

-- feedback_anon_insert had the same unscoped with_check as customers did --
-- tightened the same way: must reference a real salon, no functional
-- change for legitimate traffic (db.js always sets a resolved salon_id).
DROP POLICY IF EXISTS "feedback_anon_insert" ON public.feedback;
CREATE POLICY "feedback_anon_insert" ON public.feedback
FOR INSERT TO anon
WITH CHECK (EXISTS (SELECT 1 FROM public.salons WHERE id = feedback.salon_id));
