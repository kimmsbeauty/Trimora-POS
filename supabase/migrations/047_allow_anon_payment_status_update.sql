-- Migration: 015_allow_anon_payment_status_update.sql
-- Purpose: the public booking widget (BookingPage.jsx) calls
-- handlePaid()/handlePayLater() right after creating a booking, PATCHing
-- payment_status from 'pending' to 'paid_upfront' or 'pay_later' -- as
-- an anonymous caller (no staff login exists on this page). There was no
-- anon UPDATE policy on bookings at all, so these PATCH calls were
-- silently failing RLS every time (db()/dbDirect() doesn't check PATCH
-- results for success). payment_status likely never actually left
-- 'pending' for any booking made through this page.
--
-- This does NOT grant a blanket anon UPDATE -- that would let anyone
-- rewrite a booking's price, date, name, phone, service, or status via
-- the same public anon key. Two layers of restriction instead:
--
-- 1. Column-level GRANT: anon can only ever write to payment_status,
--    enforced by Postgres independently of any RLS policy. Verified via
--    information_schema.column_privileges that no other column is
--    grantable to anon on this table.
-- 2. Row-level policy: the row must currently be 'pending' (USING) and
--    the new value must be one of the two legitimate outcomes
--    (WITH CHECK), both bounded to bookings created in the last 2 hours.
--    `id` is a plain bigint (sequential, easily guessable/enumerable --
--    confirmed via information_schema), so the time bound meaningfully
--    limits the window in which guessing a recent booking's id could be
--    used to flip its payment status, without needing a session to
--    scope by (there isn't one -- this caller is anonymous by design).

revoke update on public.bookings from anon;
grant update (payment_status) on public.bookings to anon;

create policy "bookings_anon_update_payment_status"
  on public.bookings
  for update
  to anon
  using (
    payment_status = 'pending'
    and created_at > now() - interval '2 hours'
  )
  with check (
    payment_status in ('paid_upfront', 'pay_later')
    and created_at > now() - interval '2 hours'
  );

-- VERIFICATION NOTE (2026-07-05): the policy and column-level grant were
-- each confirmed live via direct catalog inspection (pg_policies,
-- information_schema.column_privileges) immediately after applying.
-- Same live-anon-role end-to-end testing limitation noted in migration
-- 014 applies here too -- recommend confirming via a real booking
-- through BookingPage.jsx (create a booking, click "I've Paid", confirm
-- payment_status actually changes in the dashboard) before treating this
-- as fully proven in production.
