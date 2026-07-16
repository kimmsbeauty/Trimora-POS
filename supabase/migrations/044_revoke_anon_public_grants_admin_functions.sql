-- Defense-in-depth cleanup, not a vulnerability fix (audit follow-up,
-- prompted by a fresh Supabase security-advisor pass).
--
-- The advisor flags these 12 SECURITY DEFINER functions as "callable by
-- anon". Verified via full function-body review that all 12 already
-- reject non-super-admin / non-authenticated callers internally (via an
-- auth.jwt() app_metadata check, or an auth_salon_id() IS NULL check),
-- matching the pattern already proven safe in super_admin_reset_salon_pin.
-- None has any legitimate anon use case -- a super admin or a device is
-- always an authenticated Supabase Auth session by definition, never
-- anon. This is genuinely not exploitable as-is; the value here is
-- reducing attack surface / advisor noise, not closing a live hole.
--
-- IMPORTANT LESSON (documented here rather than silently corrected):
-- `REVOKE EXECUTE ... FROM anon` alone is NOT sufficient. Postgres
-- grants EXECUTE ON FUNCTION to PUBLIC by default at creation time
-- unless explicitly revoked, and every role -- including anon --
-- inherits execute rights via PUBLIC regardless of an anon-specific
-- revoke. This was caught by re-querying
-- information_schema.role_routine_grants immediately after the first
-- REVOKE and finding PUBLIC still listed; a second REVOKE ... FROM
-- PUBLIC was required to actually close it. Verified via the advisor
-- re-run afterward: all 12 anon_security_definer_function_executable
-- warnings for these functions cleared, and no new authenticated-role
-- issues were introduced (authenticated keeps its own explicit grant,
-- unaffected by either REVOKE).
--
-- Deliberately NOT revoking the `authenticated` grant, unlike the
-- linter's blanket suggestion -- super admins connect as ordinary
-- `authenticated` sessions (distinguished by JWT app_metadata, not by
-- Postgres role), so revoking `authenticated` would break the real
-- Super Admin dashboard.
--
-- Mirrors the same "revoke excess anon grants" pattern already applied
-- elsewhere in this schema (salon_onboarding_requests,
-- auto_onboarding_requests).

REVOKE EXECUTE ON FUNCTION public.apply_wallet_transaction(uuid, text, integer, text, text, uuid, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_invite(text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_audit_log(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.issue_auto_invoice(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_auto_invoice_paid(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reactivate_salon(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_subscription_payment(uuid, text, numeric, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.super_admin_update_plan_price(text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.super_admin_update_salon(uuid, text, text, text, text, text, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.superadmin_set_module(uuid, text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suspend_salon(uuid, text) FROM anon, PUBLIC;
