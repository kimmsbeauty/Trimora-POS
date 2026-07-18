-- 077_revoke_anon_grants_super_admin_and_scoped_functions.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-16 (20260716094740) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.

-- Defense-in-depth cleanup, not a vulnerability fix (audit follow-up).
--
-- The Supabase linter flags these 12 SECURITY DEFINER functions as
-- "callable by anon". Verified via full function-body review that all
-- 12 already reject non-super-admin / non-authenticated callers
-- internally (via auth.jwt() app_metadata check or auth_salon_id() IS
-- NULL check), matching the pattern already proven safe in
-- super_admin_reset_salon_pin. None has any legitimate anon use case --
-- a super admin or a device is always an authenticated Supabase Auth
-- session by definition, never anon.
--
-- NOTE: deliberately NOT revoking the `authenticated` grant, unlike the
-- linter's blanket suggestion -- super admins connect as ordinary
-- `authenticated` sessions (distinguished by JWT app_metadata, not by
-- Postgres role), so revoking `authenticated` would break the real
-- Super Admin dashboard. Only `anon` is being revoked here.
--
-- Mirrors the same "revoke excess anon grants" pattern already applied
-- elsewhere in this schema (salon_onboarding_requests,
-- auto_onboarding_requests).

REVOKE EXECUTE ON FUNCTION public.apply_wallet_transaction(uuid, text, integer, text, text, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_invite(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_audit_log(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.issue_auto_invoice(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_auto_invoice_paid(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_salon(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_subscription_payment(uuid, text, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.super_admin_update_plan_price(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.super_admin_update_salon(uuid, text, text, text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.superadmin_set_module(uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.suspend_salon(uuid, text) FROM anon;
