-- Migration: 006_pin_security_bcrypt.sql
-- Run: 2026-06-30
-- Purpose: Upgrade PIN hashing from unsalted MD5 to bcrypt.
--          MD5 of a 4-6 digit PIN is trivially crackable via rainbow
--          tables (only 10,000-1,000,000 possible values).
--
-- Strategy: gradual migration — no disruption to existing salons.
--   - Existing MD5 hashes remain valid until next login
--   - verify_staff_pin supports both MD5 (legacy) and bcrypt (new)
--   - On successful MD5 login, hash is silently upgraded to bcrypt
--   - New PINs (via settings or super admin reset) always use bcrypt
--   - After all salons have logged in once, MD5 is fully retired

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE salon_pins
  ADD COLUMN IF NOT EXISTS hash_version text NOT NULL DEFAULT 'md5';

UPDATE salon_pins SET hash_version = 'md5' WHERE hash_version IS DISTINCT FROM 'bcrypt';

CREATE OR REPLACE FUNCTION verify_staff_pin(p_role text, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_salon_id uuid;
  v_hash     text;
  v_version  text;
  v_match    boolean := false;
BEGIN
  v_salon_id := auth_salon_id();

  SELECT pin_hash, hash_version
  INTO v_hash, v_version
  FROM salon_pins
  WHERE salon_id = v_salon_id AND role = p_role;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_version = 'bcrypt' THEN
    v_match := (crypt(p_pin, v_hash) = v_hash);
  ELSE
    v_match := (v_hash = md5(p_pin));
    IF v_match THEN
      UPDATE salon_pins
      SET pin_hash = crypt(p_pin, gen_salt('bf', 10)), hash_version = 'bcrypt'
      WHERE salon_id = v_salon_id AND role = p_role;
    END IF;
  END IF;

  RETURN v_match;
END;
$$;

CREATE OR REPLACE FUNCTION update_salon_pin(p_role text, p_new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_salon_id uuid;
BEGIN
  v_salon_id := auth_salon_id();
  IF p_role NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'p_role must be admin or staff'; END IF;
  IF p_new_pin !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN must be 4-6 digits'; END IF;
  UPDATE salon_pins
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)), hash_version = 'bcrypt'
  WHERE salon_id = v_salon_id AND role = p_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'No % PIN record found for this salon', p_role; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION super_admin_reset_salon_pin(
  p_salon_id uuid, p_role text, p_new_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean, false)
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
