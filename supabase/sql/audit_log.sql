-- ============================================================
-- TRIMORA POS — Super Admin: Audit Log
-- Run once in Supabase SQL Editor.
-- ============================================================
-- Creates a simple, append-only audit trail of Super Admin actions.
-- Does NOT modify any existing RPC (suspend_salon, reactivate_salon,
-- record_subscription_payment, super_admin_reset_salon_pin,
-- super_admin_update_salon, etc.) — zero risk to anything already
-- working. Instead, the frontend calls log_admin_action() once,
-- right after each existing action succeeds.

CREATE TABLE IF NOT EXISTS super_admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  admin_email text,
  action      text NOT NULL,        -- e.g. 'suspend_salon', 'reset_pin'
  salon_id    uuid,
  salon_name  text,                  -- denormalized snapshot, survives a later rename/delete
  details     text                   -- free-text summary, e.g. "Reason: non-payment"
);

CREATE OR REPLACE FUNCTION log_admin_action(
  p_action     text,
  p_salon_id   uuid DEFAULT NULL,
  p_salon_name text DEFAULT NULL,
  p_details    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_is_admin boolean;
  v_caller_email    text;
BEGIN
  SELECT
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean, false),
    auth.jwt() ->> 'email'
  INTO v_caller_is_admin, v_caller_email;

  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  INSERT INTO super_admin_audit_log (admin_email, action, salon_id, salon_name, details)
  VALUES (v_caller_email, p_action, p_salon_id, p_salon_name, p_details);
END;
$$;

-- Read access: only super admins can view the log.
CREATE OR REPLACE FUNCTION get_admin_audit_log(p_limit int DEFAULT 100)
RETURNS SETOF super_admin_audit_log
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean, false)
  INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  RETURN QUERY
    SELECT * FROM super_admin_audit_log
    ORDER BY created_at DESC
    LIMIT p_limit;
END;
$$;
