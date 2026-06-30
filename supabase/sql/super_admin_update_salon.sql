-- ============================================================
-- TRIMORA POS — Super Admin: Edit Salon Details
-- Run once in Supabase SQL Editor.
-- ============================================================
-- Lets a super admin update a salon's branding/contact/M-Pesa details
-- directly, without needing to log in as that salon. Mirrors exactly
-- what the salon's own SalonSettingsPage.jsx already does via two
-- PATCHes to salons.name and salon_settings — just scoped explicitly
-- by p_salon_id parameter instead of via the owner's own salon-scoped
-- session, the same way super_admin_reset_salon_pin already does.
--
-- Deliberately does NOT allow editing slug (changing it would break
-- every bookmark, installed PWA icon, and booking link already shared
-- for that salon) or subscription/suspension fields (those already
-- have their own dedicated, audited RPCs).

CREATE OR REPLACE FUNCTION super_admin_update_salon(
  p_salon_id        uuid,
  p_name            text,
  p_tagline         text DEFAULT NULL,
  p_logo_url        text DEFAULT NULL,
  p_primary_color   text DEFAULT NULL,
  p_secondary_color text DEFAULT NULL,
  p_contact_phone   text DEFAULT NULL,
  p_mpesa_till      text DEFAULT NULL,
  p_mpesa_name      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  -- Same super admin check as suspend_salon / super_admin_reset_salon_pin.
  SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean, false)
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

  -- salon_settings should already have exactly one row per salon
  -- (created at onboarding) — this UPDATE assumes that, matching how
  -- the salon's own Settings page already behaves (PATCH, not upsert).
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
$$;
