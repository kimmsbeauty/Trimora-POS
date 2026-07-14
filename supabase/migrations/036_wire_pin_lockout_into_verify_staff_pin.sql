-- Wire the existing (previously dead) pin lockout mechanism into verify_staff_pin.
--
-- check_pin_lockout(salon_id, role) and the pin_login_attempts table already
-- existed (created outside migration history, pre-dating this repo's migration
-- discipline) but nothing ever called check_pin_lockout, and nothing ever wrote
-- to pin_login_attempts. This meant the client-side 3-attempt/30-second lockout
-- in LoginPage.jsx was purely cosmetic: a script calling
-- POST /rest/v1/rpc/verify_staff_pin directly with a valid device-auth token
-- could brute-force a 4-6 digit staff/admin PIN with no server-side throttling.
--
-- This migration:
--   1. Checks check_pin_lockout() before attempting the hash comparison, and
--      returns false immediately (without comparing the PIN) if locked out.
--   2. Logs every attempt (success/failure) to pin_login_attempts so the
--      lockout function has data to work from.
--   3. Returns false immediately (instead of proceeding) if the caller has no
--      resolvable salon_id, rather than letting the SELECT ... NOT FOUND path
--      handle it implicitly.
--
-- Applied directly to the live DB and verified on 2026-07-15 (functional test
-- against a real salon_id using a throwaway role name, cleaned up afterward;
-- grants confirmed unchanged; security advisor confirmed no new findings).
-- This file exists to bring the migration history back in sync with prod.

CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_role text, p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_salon_id uuid;
  v_hash     text;
  v_version  text;
  v_match    boolean := false;
BEGIN
  v_salon_id := auth_salon_id();

  IF v_salon_id IS NULL THEN
    RETURN false;
  END IF;

  IF check_pin_lockout(v_salon_id, p_role) THEN
    RETURN false;
  END IF;

  SELECT pin_hash, hash_version
  INTO v_hash, v_version
  FROM salon_pins
  WHERE salon_id = v_salon_id AND role = p_role;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_version = 'bcrypt' THEN
    -- bcrypt comparison
    v_match := (crypt(p_pin, v_hash) = v_hash);
  ELSE
    -- legacy MD5 comparison
    v_match := (v_hash = md5(p_pin));
    -- Silent upgrade: rehash to bcrypt on successful MD5 login
    IF v_match THEN
      UPDATE salon_pins
      SET pin_hash     = crypt(p_pin, gen_salt('bf', 10)),
          hash_version = 'bcrypt'
      WHERE salon_id = v_salon_id AND role = p_role;
    END IF;
  END IF;

  INSERT INTO pin_login_attempts (salon_id, role, success)
  VALUES (v_salon_id, p_role, v_match);

  RETURN v_match;
END;
$function$;
