-- Stopgap rate-limit for silent-device-login (audit Critical-1).
--
-- silent-device-login mints a full device-auth session for any salon_id
-- with no proof of caller legitimacy -- salon_id is intentionally public
-- (resolved from the booking-page slug), so this endpoint currently has
-- no real trust boundary. The actual fix requires a device-bound
-- credential (tracked separately, larger change, needs its own session).
--
-- This migration only adds the logging table this stopgap needs: a
-- count of recent calls per salon_id, used by silent-device-login to
-- reject with 429 after 20 calls in 10 minutes. Generous margin -- a
-- real shop's open tab re-checks every 5 minutes, so this only affects
-- automated/bulk hammering of a single salon_id, not real usage.
--
-- Applied directly to the live DB and verified 2026-07-14 (query shape
-- exercised against a real salon, test insert/delete cleaned up). This
-- file brings migration history back in sync with prod.

CREATE TABLE public.device_login_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.device_login_events ENABLE ROW LEVEL SECURITY;
-- No policies: only ever read/written by silent-device-login using the
-- service-role key directly (same pattern as mpesa-stk-push's existing
-- phone-based rate limit), which bypasses RLS entirely. Default-deny
-- for anon/authenticated is intentional, matching pin_login_attempts.

CREATE INDEX device_login_events_salon_created_idx
  ON public.device_login_events (salon_id, created_at);
