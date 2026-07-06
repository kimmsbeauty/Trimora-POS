-- Migration: 014_harden_bookings_anon_insert.sql
-- Purpose: bookings_anon_insert (public booking widget, BookingPage.jsx)
-- had WITH CHECK (true) -- no validation at all beyond column type/
-- not-null constraints. The app itself always sends a real, resolved
-- salon_id (see src/lib/db.js's tenant-table injection), but this is a
-- public, unauthenticated, anon-key-authenticated endpoint -- anyone
-- bypassing the app's own JS (trivial, since the anon key is public by
-- design) can POST directly to the REST API with any salon_id,
-- including one that doesn't correspond to a real salon at all, or a
-- suspended one.
--
-- This does NOT add rate limiting or prevent someone from spamming a
-- REAL, active salon's calendar with junk bookings using a valid
-- salon_id -- that's a different problem (would need something like
-- request throttling or a CAPTCHA) and is intentionally left as a known,
-- accepted limitation rather than silently expanded in scope here. This
-- migration only closes the "insert into a nonexistent or suspended
-- tenant" class of garbage data.
--
-- IMPLEMENTATION NOTE: a direct `EXISTS (SELECT 1 FROM salons WHERE ...)`
-- inside the policy does NOT work, because `salons` itself has RLS
-- enabled with only an `authenticated`-scoped SELECT policy -- from
-- `anon`'s perspective the table is invisible (RLS filters it to zero
-- rows), so the EXISTS would always be false and break the entire
-- legitimate flow. A narrow SECURITY DEFINER function is used instead --
-- it returns only a boolean (does this salon exist and is it not
-- suspended), never exposing any actual salon data to the anon caller.

create or replace function public.salon_is_bookable(p_salon_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.salons
    where salons.id = p_salon_id
      and coalesce(salons.suspended, false) = false
  );
$$;

revoke all on function public.salon_is_bookable(uuid) from public;
grant execute on function public.salon_is_bookable(uuid) to anon, authenticated;

DROP POLICY IF EXISTS "bookings_anon_insert" ON public.bookings;
CREATE POLICY "bookings_anon_insert"
  ON public.bookings
  FOR INSERT
  TO anon
  WITH CHECK (
    public.salon_is_bookable(salon_id)
    AND name IS NOT NULL AND btrim(name) <> ''
    AND phone IS NOT NULL AND btrim(phone) <> ''
  );

-- VERIFICATION NOTE (2026-07-05): each clause of the WITH CHECK expression
-- was verified independently via direct SQL evaluation as the anon role
-- (salon_is_bookable() returns true for a real active salon and would
-- return false for a fake/suspended one; the name/phone conditions were
-- confirmed against literal test values). A live end-to-end INSERT test
-- as the anon role was attempted but was inconclusive due to a sandboxed
-- tool limitation (SET ROLE-based testing behaved unreliably in that
-- environment, in a way that also affected a control test using
-- WITH CHECK (true) -- i.e. the anomaly wasn't specific to this policy's
-- logic). Recommend a real end-to-end test via the actual public anon key
-- against the live REST API (a real booking through BookingPage.jsx, plus
-- a manual curl attempt with a fabricated salon_id to confirm it's
-- rejected) before fully trusting this without reservation.
