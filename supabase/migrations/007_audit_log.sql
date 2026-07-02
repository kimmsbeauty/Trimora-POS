-- Migration: 007_audit_log.sql
-- Run: 2026-06-30
-- Purpose: Append-only audit trail of all Super Admin actions.
--          See supabase/sql/audit_log.sql for the full version with comments.

CREATE TABLE IF NOT EXISTS super_admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  admin_email text,
  action      text NOT NULL,
  salon_id    uuid,
  salon_name  text,
  details     text
);

CREATE OR REPLACE FUNCTION log_admin_action(
  p_action text, p_salon_id uuid DEFAULT NULL,
  p_salon_name text DEFAULT NULL, p_details text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_admin boolean; v_email text;
BEGIN
  SELECT COALESCE((auth.jwt()->'user_metadata'->>'is_super_admin')::boolean,false),
         auth.jwt()->>'email'
  INTO v_is_admin, v_email;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Access denied'; END IF;
  INSERT INTO super_admin_audit_log(admin_email,action,salon_id,salon_name,details)
  VALUES(v_email,p_action,p_salon_id,p_salon_name,p_details);
END;$$;

CREATE OR REPLACE FUNCTION get_admin_audit_log(p_limit int DEFAULT 100)
RETURNS SETOF super_admin_audit_log LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt()->'user_metadata'->>'is_super_admin')::boolean,false)
  INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN QUERY SELECT * FROM super_admin_audit_log ORDER BY created_at DESC LIMIT p_limit;
END;$$;
