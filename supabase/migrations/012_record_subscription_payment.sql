-- Migration: 012_record_subscription_payment.sql
-- Run: 2026-07-02
-- Purpose: Add the missing record_subscription_payment RPC.
--
-- SuperAdminDashboard.jsx's recordPayment() has been calling
-- /rest/v1/rpc/record_subscription_payment with
-- (p_salon_id, p_plan, p_amount, p_notes) since it was built, but the
-- function was never created — every call to it fails with
-- "function not found". The schema it needs already existed
-- (salon_subscriptions for current status/expiry, keyed uniquely on
-- salon_id; salon_subscription_payments as the payment log; both
-- already wired into the salon_directory view) — only the function
-- tying them together was missing.
--
-- Behaviour:
--   - Super-admin only (same app_metadata check as the other 8 admin
--     functions, per 011).
--   - Logs the payment in salon_subscription_payments (history, one
--     row per payment, never overwritten).
--   - Upserts salon_subscriptions (current state, one row per salon):
--       status = 'lifetime' if plan is lifetime, else 'active'
--       expires_at = null for lifetime, else now() + period_days
--       from subscription_plans for that plan
--       amount_paid = this payment's amount (most recent, not a sum -
--       running totals live in the payments table if ever needed)
--   - Validates the plan exists and is active before doing anything.

CREATE OR REPLACE FUNCTION public.record_subscription_payment(
  p_salon_id uuid, p_plan text, p_amount numeric, p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller_is_admin boolean;
  v_caller_email    text;
  v_period_days     integer;
  v_plan_valid      boolean;
BEGIN
  SELECT
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false),
    auth.jwt() ->> 'email'
  INTO v_caller_is_admin, v_caller_email;

  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT period_days, true INTO v_period_days, v_plan_valid
  FROM subscription_plans
  WHERE key = p_plan AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive plan: %', p_plan;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM salons WHERE id = p_salon_id) THEN
    RAISE EXCEPTION 'Salon not found: %', p_salon_id;
  END IF;

  INSERT INTO salon_subscription_payments (salon_id, plan, amount, notes, recorded_by)
  VALUES (p_salon_id, p_plan, p_amount, p_notes, COALESCE(v_caller_email, 'admin'));

  INSERT INTO salon_subscriptions (salon_id, plan, status, started_at, expires_at, amount_paid, updated_at)
  VALUES (
    p_salon_id,
    p_plan,
    CASE WHEN v_period_days IS NULL THEN 'lifetime' ELSE 'active' END,
    now(),
    CASE WHEN v_period_days IS NULL THEN NULL ELSE now() + (v_period_days || ' days')::interval END,
    p_amount,
    now()
  )
  ON CONFLICT (salon_id) DO UPDATE SET
    plan        = EXCLUDED.plan,
    status      = EXCLUDED.status,
    started_at  = now(),
    expires_at  = EXCLUDED.expires_at,
    amount_paid = EXCLUDED.amount_paid,
    updated_at  = now();
END;
$function$;
