-- 059_lock_pin_reset_tokens.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-03 (20260703063436) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.

-- pin_reset_tokens had a SELECT policy (anyone_can_read_by_token, qual: true,
-- role: public) allowing anyone with the anon key to read every reset token
-- for every salon, with no need to already possess a token. Confirmed via
-- full repo search (frontend, Edge Functions, tracked migrations) that
-- ZERO code references this table — no PIN-reset-by-link feature is built
-- yet. Safe to remove with no functional impact.
--
-- admin_can_create_reset_tokens (INSERT) and admin_can_update_reset_tokens
-- (UPDATE) are correctly scoped via auth.uid() and are left untouched.

DROP POLICY IF EXISTS "anyone_can_read_by_token" ON public.pin_reset_tokens;
