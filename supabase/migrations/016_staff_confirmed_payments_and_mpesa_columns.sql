-- Migration: 016_staff_confirmed_payments_and_mpesa_columns.sql
-- Purpose: closes the actual verification gap Lucy raised -- until now,
-- a customer clicking "I've Paid" on the public booking page set
-- payment_status straight to 'paid_upfront' with zero verification. That
-- was always just an honor-system checkbox, not proof any money moved.
--
-- Interim fix (option 1, while Safaricom Daraja finalization is pending):
-- move confirmation to staff. The customer's claim now lands in a new
-- intermediate state, 'awaiting_confirmation', not the confirmed state
-- directly. Staff check their own M-Pesa SMS/app and confirm it from the
-- POS app (POSApp.jsx's new confirmPayment()) -- an authenticated,
-- salon-scoped action, using the existing bookings_update_own_salon
-- policy (no RLS change needed for that side; staff already have full
-- update rights on their own salon's bookings).
--
-- Also reserves four nullable columns now for the eventual Daraja STK
-- Push integration (option 3, once Safaricom finalization completes),
-- so no further schema migration is needed at that point:
--   payment_claimed_at         -- when the customer clicked "I've Paid"
--   mpesa_receipt_number       -- Safaricom's real receipt number, once
--                                  STK Push callbacks are wired in
--   mpesa_checkout_request_id  -- Daraja's CheckoutRequestID, used to
--                                  match an async callback back to the
--                                  booking that initiated it
--   mpesa_transaction_date     -- Safaricom's own transaction timestamp
--                                  from the callback, not our own clock

alter table public.bookings
  add column if not exists payment_claimed_at timestamptz,
  add column if not exists mpesa_receipt_number text,
  add column if not exists mpesa_checkout_request_id text,
  add column if not exists mpesa_transaction_date timestamptz;

-- anon can now set payment_claimed_at alongside payment_status (both are
-- things the customer's own "I've Paid" click legitimately sets).
grant update (payment_status, payment_claimed_at) on public.bookings to anon;

-- The anon claim path no longer reaches paid_upfront directly -- only
-- awaiting_confirmation (customer claim) or pay_later (no claim made
-- yet, deferred to pay in person). paid_upfront now only happens via
-- staff confirmation through the authenticated policy.
DROP POLICY IF EXISTS "bookings_anon_update_payment_status" ON public.bookings;
CREATE POLICY "bookings_anon_update_payment_status"
  ON public.bookings
  FOR UPDATE
  TO anon
  USING (payment_status = 'pending')
  WITH CHECK (payment_status IN ('awaiting_confirmation', 'pay_later'));

-- VERIFICATION NOTE (2026-07-05): grant, columns, and policy confirmed
-- live via information_schema and pg_policies. As with migrations 014/015,
-- a live end-to-end anon PATCH test through this exact policy was not
-- completed due to the same sandboxed SET ROLE testing limitation --
-- recommend confirming through a real booking (click "I've Paid", check
-- the row lands in awaiting_confirmation, then confirm it from the POS
-- app's Appointments screen and check it becomes paid_upfront).
