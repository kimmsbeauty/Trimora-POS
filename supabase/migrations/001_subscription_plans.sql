-- Migration: 001_subscription_plans.sql
-- Run: 2026-06-30
-- Purpose: Move subscription plan prices out of hardcoded frontend
--          constants into a database table so Super Admin can adjust
--          pricing without a code deployment.

CREATE TABLE IF NOT EXISTS subscription_plans (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  price_kes   integer NOT NULL,
  period_days integer,
  save_label  text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

INSERT INTO subscription_plans (key, label, price_kes, period_days, save_label, sort_order) VALUES
  ('monthly',     'Monthly',     1200,  30,   '',          1),
  ('quarterly',   'Quarterly',   3300,  90,   'Save 8%',   2),
  ('semi_annual', 'Semi-Annual', 6000,  180,  'Save 17%',  3),
  ('annual',      'Annual',      10800, 365,  'Save 25%',  4),
  ('lifetime',    'Lifetime',    38000, NULL, 'One-time',  5)
ON CONFLICT (key) DO NOTHING;

-- RPC: Super Admin can update a plan price
CREATE OR REPLACE FUNCTION super_admin_update_plan_price(
  p_key       text,
  p_price_kes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean, false)
  INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Access denied: super admin only'; END IF;
  IF p_price_kes < 0 THEN RAISE EXCEPTION 'Price cannot be negative'; END IF;
  UPDATE subscription_plans SET price_kes = p_price_kes WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found: %', p_key; END IF;
END;
$$;

-- RLS: anyone can read (booking/settings pages need prices)
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read plans" ON subscription_plans
  FOR SELECT USING (true);
CREATE POLICY "super admin can update plans" ON subscription_plans
  FOR UPDATE USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean, false)
  );
