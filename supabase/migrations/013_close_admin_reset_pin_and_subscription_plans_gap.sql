-- Migration: 013_close_admin_reset_pin_and_subscription_plans_gap.sql
-- Purpose: Close the two gaps left by 011_fix_super_admin_privilege_escalation.sql.
--
-- 011 fixed 8 named RPC functions that checked the self-editable
-- `user_metadata` JWT claim instead of the trusted `app_metadata` claim.
-- Two things were out of that migration's stated scope and were missed:
--
-- 1. admin_reset_pin(uuid, text, text) -- a LEGACY function, superseded
--    by super_admin_reset_salon_pin (which 011 already fixed correctly).
--    admin_reset_pin still checked user_metadata AND hashed PINs with
--    plain md5() instead of bcrypt. Confirmed via a full grep of the
--    frontend (src/**/*.{js,jsx}) that no code calls it -- it's dead,
--    not just insecure. All 8 live salon_pins rows are already bcrypt
--    (confirmed via `select hash_version, count(*) from salon_pins
--    group by hash_version` on 2026-07-05), consistent with the app
--    having already fully moved to the bcrypt function.
--
-- 2. The `subscription_plans` table's own RLS policy ("super admin can
--    update plans") -- this is a table-level policy, not one of the 8
--    functions 011 enumerated, so it was never touched. It still checked
--    user_metadata directly.
--
-- Both together meant: despite 011 shipping, a user who granted
-- themselves is_super_admin via user_metadata could still (a) call
-- admin_reset_pin to overwrite any salon's PIN with a weakly-hashed
-- value, and (b) directly UPDATE subscription_plans pricing via PostgREST
-- without going through super_admin_update_plan_price at all.

-- 1. Drop the legacy, unused, insecure function.
DROP FUNCTION IF EXISTS public.admin_reset_pin(uuid, text, text);

-- 2. Fix the subscription_plans RLS policy to match every other
--    super-admin check in the codebase (app_metadata, not user_metadata).
DROP POLICY IF EXISTS "super admin can update plans" ON public.subscription_plans;
CREATE POLICY "super admin can update plans"
  ON public.subscription_plans
  FOR UPDATE
  USING (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false));
