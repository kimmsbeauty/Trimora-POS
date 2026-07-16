-- Real fix for audit Critical-1 (device impersonation via
-- silent-device-login). See supabase/functions/device-pin-login/index.ts
-- for the full flow this supports.
--
-- silent-device-login minted a full session for any salon_id with zero
-- proof of caller legitimacy. The actual fix: make PIN entry itself both
-- verify identity AND establish the session, in one step, instead of
-- silently establishing a session first and checking the PIN after
-- (which made the PIN screen cosmetic on top of an already-open
-- session).
--
-- This function is the server-side PIN check for that flow, called from
-- device-pin-login before any session exists for the caller -- so
-- unlike verify_staff_pin, it cannot use auth_salon_id() and takes
-- salon_id as an explicit parameter instead.
--
-- This is intentionally NOT a repeat of the old verify_pin_for_salon
-- mistake (a separate audit finding, already remediated): that function
-- was anon-executable, compared against raw MD5 only regardless of
-- hash_version, and had no lockout. This function:
--   - checks check_pin_lockout() before comparing anything
--   - handles both bcrypt and legacy md5 (with silent upgrade), matching
--     verify_staff_pin's logic exactly
--   - logs every attempt to pin_login_attempts
--   - is granted to service_role ONLY -- anon/authenticated/PUBLIC can
--     never call it directly. It must only ever be invoked from within
--     the device-pin-login Edge Function using the service-role key.
--
-- Applied directly to the live DB and verified 2026-07-15: a throwaway
-- PIN was inserted for a real salon under a nonsense role name, tested
-- for correct-PIN success, incorrect-PIN failure, and lockout after 5
-- failures (even a correct PIN is then rejected). All test data cleaned
-- up afterward. This file brings migration history back in sync with
-- prod.

CREATE OR REPLACE FUNCTION public.verify_pin_for_device_login(p_salon_id uuid, p_role text, p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_hash     text;
  v_version  text;
  v_match    boolean := false;
BEGIN
  IF p_salon_id IS NULL THEN
    RETURN false;
  END IF;

  IF check_pin_lockout(p_salon_id, p_role) THEN
    RETURN false;
  END IF;

  SELECT pin_hash, hash_version
  INTO v_hash, v_version
  FROM salon_pins
  WHERE salon_id = p_salon_id AND role = p_role;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_version = 'bcrypt' THEN
    v_match := (crypt(p_pin, v_hash) = v_hash);
  ELSE
    v_match := (v_hash = md5(p_pin));
    IF v_match THEN
      UPDATE salon_pins
      SET pin_hash     = crypt(p_pin, gen_salt('bf', 10)),
          hash_version = 'bcrypt'
      WHERE salon_id = p_salon_id AND role = p_role;
    END IF;
  END IF;

  INSERT INTO pin_login_attempts (salon_id, role, success)
  VALUES (p_salon_id, p_role, v_match);

  RETURN v_match;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_pin_for_device_login(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_pin_for_device_login(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.verify_pin_for_device_login(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin_for_device_login(uuid, text, text) TO service_role;
