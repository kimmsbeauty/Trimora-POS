-- Migration: 008_super_admin_update_salon.sql
-- Run: 2026-06-30
-- Purpose: Lets Super Admin edit a salon's branding/contact/M-Pesa
--          details without logging in as that salon.
--          See supabase/sql/super_admin_update_salon.sql for full version.

CREATE OR REPLACE FUNCTION super_admin_update_salon(
  p_salon_id uuid, p_name text, p_tagline text DEFAULT NULL,
  p_logo_url text DEFAULT NULL, p_primary_color text DEFAULT NULL,
  p_secondary_color text DEFAULT NULL, p_contact_phone text DEFAULT NULL,
  p_mpesa_till text DEFAULT NULL, p_mpesa_name text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt()->'user_metadata'->>'is_super_admin')::boolean,false)
  INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Access denied: super admin only'; END IF;
  IF p_name IS NULL OR trim(p_name)='' THEN RAISE EXCEPTION 'Salon name cannot be empty'; END IF;
  UPDATE salons SET name=trim(p_name) WHERE id=p_salon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Salon not found'; END IF;
  UPDATE salon_settings SET
    tagline=p_tagline, logo_url=p_logo_url,
    primary_color=COALESCE(p_primary_color,primary_color),
    secondary_color=COALESCE(p_secondary_color,secondary_color),
    contact_phone=p_contact_phone, mpesa_till=p_mpesa_till, mpesa_name=p_mpesa_name
  WHERE salon_id=p_salon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No salon_settings row found'; END IF;
END;$$;
