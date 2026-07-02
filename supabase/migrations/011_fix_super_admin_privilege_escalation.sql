-- Migration: 011_fix_super_admin_privilege_escalation.sql
-- Run: 2026-07-02
-- Purpose: Close a privilege-escalation hole affecting all super-admin RPCs.
--
-- Every super-admin function (suspend_salon, reactivate_salon,
-- super_admin_update_salon, super_admin_reset_salon_pin,
-- super_admin_update_plan_price, create_invite, log_admin_action,
-- get_admin_audit_log) checked:
--
--   auth.jwt() -> 'user_metadata' ->> 'is_super_admin'
--
-- `user_metadata` in Supabase is self-editable by any authenticated
-- user via the client SDK (supabase.auth.updateUser({ data: {...} })),
-- using nothing but their own session. It is NOT a trusted admin flag.
-- The trusted equivalent is `app_metadata`, which can only be written
-- server-side with the service role key. There was no trigger on
-- auth.users blocking the self-edit, so ANY logged-in user could have
-- granted themselves super admin and taken over the entire platform
-- (suspend any salon, rewrite branding/M-Pesa till, reset any PIN,
-- mint invites, change platform pricing, read the admin audit log).
--
-- Fix:
--   1. Move the one legitimate admin's is_super_admin flag from
--      raw_user_meta_data to raw_app_meta_data, and strip it out of
--      raw_user_meta_data so it can no longer be read from there by
--      mistake in the future.
--   2. Update all 8 functions to check app_metadata instead.
--
-- Nothing else about each function's logic changes.

-- 1. Move the flag for the real admin account. Service-role-level
--    write to auth.users, which is exactly why this field is safe.
UPDATE auth.users
SET
  raw_app_meta_data  = raw_app_meta_data || jsonb_build_object('is_super_admin', true),
  raw_user_meta_data = raw_user_meta_data - 'is_super_admin'
WHERE email = 'admin@trimorasystems.com';

-- 2. Update every function to read from app_metadata.

CREATE OR REPLACE FUNCTION public.create_invite(p_email text DEFAULT NULL::text, p_salon_name text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_token text;
begin
  if not (
    select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  ) then
    raise exception 'Access denied: super admin only';
  end if;

  insert into salon_invites (email, salon_name)
  values (p_email, p_salon_name)
  returning token into v_token;

  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_audit_log(p_limit integer DEFAULT 100)
 RETURNS SETOF super_admin_audit_log
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  RETURN QUERY
    SELECT * FROM super_admin_audit_log
    ORDER BY created_at DESC
    LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_admin_action(p_action text, p_salon_id uuid DEFAULT NULL::uuid, p_salon_name text DEFAULT NULL::text, p_details text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller_is_admin boolean;
  v_caller_email    text;
BEGIN
  SELECT
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false),
    auth.jwt() ->> 'email'
  INTO v_caller_is_admin, v_caller_email;

  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  INSERT INTO super_admin_audit_log (admin_email, action, salon_id, salon_name, details)
  VALUES (v_caller_email, p_action, p_salon_id, p_salon_name, p_details);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reactivate_salon(p_salon_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if not (
    select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  ) then
    raise exception 'Access denied: super admin only';
  end if;

  update salons
  set
    suspended        = false,
    suspended_at     = null,
    suspended_reason = null
  where id = p_salon_id;

  if not found then
    raise exception 'Salon not found: %', p_salon_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.super_admin_update_plan_price(p_key text, p_price_kes integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Access denied: super admin only'; END IF;
  IF p_price_kes < 0 THEN RAISE EXCEPTION 'Price cannot be negative'; END IF;
  UPDATE subscription_plans SET price_kes = p_price_kes WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found: %', p_key; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.super_admin_update_salon(p_salon_id uuid, p_name text, p_tagline text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_secondary_color text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_mpesa_till text DEFAULT NULL::text, p_mpesa_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Salon name cannot be empty';
  END IF;

  UPDATE salons
  SET name = trim(p_name)
  WHERE id = p_salon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salon not found';
  END IF;

  UPDATE salon_settings
  SET
    tagline          = p_tagline,
    logo_url         = p_logo_url,
    primary_color    = COALESCE(p_primary_color, primary_color),
    secondary_color  = COALESCE(p_secondary_color, secondary_color),
    contact_phone    = p_contact_phone,
    mpesa_till       = p_mpesa_till,
    mpesa_name       = p_mpesa_name
  WHERE salon_id = p_salon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No salon_settings row found for this salon — cannot update branding/contact fields';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.suspend_salon(p_salon_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if not (
    select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  ) then
    raise exception 'Access denied: super admin only';
  end if;

  update salons
  set
    suspended        = true,
    suspended_at     = now(),
    suspended_reason = coalesce(p_reason, 'Suspended by admin')
  where id = p_salon_id;

  if not found then
    raise exception 'Salon not found: %', p_salon_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.super_admin_reset_salon_pin(
  p_salon_id uuid, p_role text, p_new_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  INTO v_caller_is_admin;
  IF NOT v_caller_is_admin THEN RAISE EXCEPTION 'Access denied: super admin only'; END IF;
  IF p_role NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'p_role must be admin or staff'; END IF;
  IF p_new_pin !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN must be 4-6 digits'; END IF;
  UPDATE salon_pins
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)), hash_version = 'bcrypt'
  WHERE salon_id = p_salon_id AND role = p_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'No % PIN record found for this salon', p_role; END IF;
END;
$$;
