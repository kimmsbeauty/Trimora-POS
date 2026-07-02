-- Migration: 010_close_onboarding_bypass.sql
-- Run: 2026-07-02
-- Purpose: Close a security gap left by the invite-token fix applied
--          directly via the SQL editor earlier today (commits 776edab,
--          9129d73). That fix added a NEW 5-arg overload of
--          complete_salon_onboarding(..., p_token) that correctly
--          enforces invite validation, but never dropped the ORIGINAL
--          4-arg overload. Postgres allows function overloading, so
--          both existed simultaneously — the old unprotected version
--          remained callable by any `authenticated` session (anyone
--          who has signed up for a plain auth account, invite or not),
--          fully bypassing the invite check the fix was meant to add.
--
-- Verified before writing this migration:
--   - grants showed the old 4-arg overload was EXECUTE-able by
--     `authenticated` (not `anon`, but that's not the barrier —
--     signing up for an auth account requires no invite of its own)
--   - repo-wide search confirmed both call sites (OnboardingPage.jsx,
--     SuperAdminDashboard.jsx) already pass p_token and only ever
--     target the 5-arg signature — safe to drop the 4-arg one
--   - the 5-arg version was still hashing PINs with md5(), missed by
--     yesterday's bcrypt migration (006_pin_security_bcrypt.sql),
--     which only touched verify_staff_pin / update_salon_pin /
--     super_admin_reset_salon_pin
--
-- Strategy: same gradual/non-disruptive pattern as 006 — new PINs
--   from this function now go straight to bcrypt. verify_staff_pin's
--   existing MD5-fallback-with-silent-upgrade logic (from 006) still
--   covers any pre-existing MD5 rows untouched by this migration.

-- 1. Drop the old, unprotected overload. Explicit arg list required
--    since only that exact overload should be removed.
DROP FUNCTION IF EXISTS public.complete_salon_onboarding(text, text, text, text);

-- 2. Redefine the 5-arg (token-enforced) version to hash PINs with
--    bcrypt instead of md5, matching every other PIN-writing function.
CREATE OR REPLACE FUNCTION public.complete_salon_onboarding(
  p_salon_name text, p_slug text, p_staff_pin text, p_admin_pin text, p_token text
)
RETURNS TABLE(salon_id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_salon_id uuid;
begin
  update salon_invites
  set used = true, used_at = now()
  where token = p_token
    and used = false
    and expires_at > now();

  if not found then
    raise exception 'Invalid, expired, or already-used invite token';
  end if;

  insert into salons (name, slug)
  values (p_salon_name, p_slug)
  returning id into v_salon_id;

  insert into salon_auth_users (id, salon_id)
  values (auth.uid(), v_salon_id);

  insert into salon_pins (role, pin_hash, hash_version, salon_id)
  values
    ('staff', crypt(p_staff_pin, gen_salt('bf', 10)), 'bcrypt', v_salon_id),
    ('admin', crypt(p_admin_pin, gen_salt('bf', 10)), 'bcrypt', v_salon_id);

  insert into salon_settings (salon_id)
  values (v_salon_id);

  return query select v_salon_id, p_slug;
end;
$function$;
