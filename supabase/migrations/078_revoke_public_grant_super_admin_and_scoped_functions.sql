-- 078_revoke_public_grant_super_admin_and_scoped_functions.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-16 (20260716094809) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.

-- Correction to the previous migration: REVOKE ... FROM anon alone is
-- not sufficient. Postgres's default GRANT EXECUTE ON FUNCTION ... TO
-- PUBLIC (applied automatically at function creation unless explicitly
-- revoked) means every role -- including anon -- inherits execute
-- rights via PUBLIC regardless of a role-specific revoke. Verified via
-- information_schema.role_routine_grants that PUBLIC was still listed
-- as a grantee after the prior migration, meaning anon's effective
-- access was unchanged. This revokes PUBLIC explicitly, which is what
-- actually closes it. authenticated/postgres/service_role each already
-- have their own explicit grants (confirmed) and are unaffected.

REVOKE EXECUTE ON FUNCTION public.apply_wallet_transaction(uuid, text, integer, text, text, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_invite(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_audit_log(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.issue_auto_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_auto_invoice_paid(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reactivate_salon(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_subscription_payment(uuid, text, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.super_admin_update_plan_price(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.super_admin_update_salon(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.superadmin_set_module(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suspend_salon(uuid, text) FROM PUBLIC;
