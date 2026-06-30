-- ============================================================
-- TRIMORA POS — Super Admin: Reset Salon PIN
-- Run once in Supabase SQL Editor.
-- ============================================================
-- Lets a super admin reset a salon's admin or staff PIN directly,
-- for cases where the owner is fully locked out (lost PIN AND no
-- access to the email used for self-service reset).
--
-- Schema confirmed via Table Editor on 2026-06-30:
--   salon_pins (role text, pin_hash text, salon_id uuid)
--   pin_hash = plain md5(pin) — e.g. md5('1234') = 81dc9bdb52d04dc20036dbd8313ed055
--
-- This mirrors what the self-service update_salon_pin RPC does, but
-- scoped explicitly by salon_id parameter instead of via the caller's
-- own salon-scoped session (auth_salon_id()) — necessary because a
-- super admin's JWT has no salon association at all.

CREATE OR REPLACE FUNCTION super_admin_reset_salon_pin(
  p_salon_id uuid,
  p_role     text,    -- 'admin' or 'staff'
  p_new_pin  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  -- Verify caller is a super admin via their JWT metadata, exactly
  -- the same check suspend_salon/reactivate_salon already rely on.
  SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean, false)
  INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  IF p_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'p_role must be admin or staff';
  END IF;

  IF p_new_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4-6 digits';
  END IF;

  -- Confirmed via Table Editor: salon_pins.pin_hash is plain MD5 of
  -- the PIN string (no salt) — matches existing rows exactly
  -- (e.g. md5('1234') = 81dc9bdb52d04dc20036dbd8313ed055).
  -- Using Postgres's built-in md5() — no pgcrypto extension needed.
  UPDATE salon_pins
  SET pin_hash = md5(p_new_pin)
  WHERE salon_id = p_salon_id AND role = p_role;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No % PIN record found for this salon', p_role;
  END IF;
END;
$$;
