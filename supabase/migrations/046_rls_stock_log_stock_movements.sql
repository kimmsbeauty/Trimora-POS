-- Migration: 009_rls_stock_log_stock_movements.sql
-- Run: 2026-07-02
-- Purpose: Enable RLS on stock_log and stock_movements which were the
--          only two tables without it. Both tables lack a direct salon_id
--          column — they reference stock via product_id (text) — so
--          policies join through the stock table to get salon context.
--
-- After this migration all 27 public tables have RLS ON:
--   25 tables had RLS already (confirmed in security audit)
--   2 tables fixed here: stock_log, stock_movements
--
-- Tables with 0 policies are intentionally deny-all (accessed only
-- via SECURITY DEFINER RPCs or service role key, never directly):
--   pin_login_attempts, salon_auth_users, salon_device_secrets,
--   salon_invites, super_admin_audit_log

ALTER TABLE stock_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon can read own stock_log"
  ON stock_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM stock s
      WHERE s.id::text = stock_log.product_id
      AND s.salon_id = auth_salon_id()
    )
  );

CREATE POLICY "salon can insert own stock_log"
  ON stock_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stock s
      WHERE s.id::text = stock_log.product_id
      AND s.salon_id = auth_salon_id()
    )
  );

CREATE POLICY "salon can read own stock_movements"
  ON stock_movements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM stock s
      WHERE s.id::text = stock_movements.product_id
      AND s.salon_id = auth_salon_id()
    )
  );

CREATE POLICY "salon can insert own stock_movements"
  ON stock_movements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stock s
      WHERE s.id::text = stock_movements.product_id
      AND s.salon_id = auth_salon_id()
    )
  );
