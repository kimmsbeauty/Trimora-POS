-- Migration: 015_add_bookings_anon_update_payment_status.sql
-- Purpose: BookingPage.jsx's handlePaid()/handlePayLater() PATCH the
-- booking's payment_status after the customer chooses how they'll pay --
-- but there was NO anon UPDATE policy on bookings at all. Every one of
-- those PATCH calls has been silently failing RLS since this flow was
-- built: payment_status likely never actually left 'pending' for any
-- booking made through the public booking page.
--
-- Note on real-world severity: this does not affect actual money moving.
-- The real M-Pesa payment happens directly between customer and salon via
-- Till/Paybill/Send Money, entirely outside this app -- payment_status is
-- a self-reported bookkeeping flag for the salon's own booking list, not
-- a verified transaction record. The bug meant that flag was stuck, not
-- that payments were lost.
--
-- Fix, deliberately narrow:
--   1. Column-level GRANT: anon can UPDATE *only* payment_status on
--      bookings, never price/service/date/name/phone/salon_id/etc, even
--      if a crafted request includes those fields.
--   2. RLS: a row is only targetable by anon while payment_status is
--      still 'pending' (USING), and the new value must be one of
--      paid_upfront/pay_later (WITH CHECK) -- so a booking can transition
--      exactly once through this path, never be flipped back, and never
--      be set to an arbitrary value.
--
-- Known residual limitation (not fixed here, flagged for awareness):
-- bookings.id is a plain sequential bigint, not a random/opaque token,
-- so this doesn't verify the caller actually owns the specific booking
-- being updated -- someone could enumerate ids and flip an unrelated
-- salon's pending booking to "paid_upfront" without ever paying. Given
-- the field is bookkeeping-only (see above), the practical impact is a
-- salon's own booking list showing an incorrect flag, not financial
-- loss or a data breach. A proper fix would give each booking a random
-- access token at creation and require it in the PATCH filter instead of
-- (or alongside) id -- a real schema + frontend change, not done here
-- since it's a different, larger scope than "the PATCH silently fails."

revoke update on public.bookings from anon;
grant update (payment_status) on public.bookings to anon;

DROP POLICY IF EXISTS "bookings_anon_update_payment_status" ON public.bookings;
CREATE POLICY "bookings_anon_update_payment_status"
  ON public.bookings
  FOR UPDATE
  TO anon
  USING (payment_status = 'pending')
  WITH CHECK (payment_status IN ('paid_upfront', 'pay_later'));

-- VERIFICATION NOTE (2026-07-05): grant and policy confirmed live via
-- information_schema.column_privileges and pg_policies respectively. As
-- with migration 014, a live end-to-end anon PATCH test was not
-- completed due to the same sandboxed SET ROLE testing limitation --
-- recommend confirming via a real booking through BookingPage.jsx that
-- clicking "I've paid" / "pay later" now actually updates payment_status
-- (previously it silently would not have).
