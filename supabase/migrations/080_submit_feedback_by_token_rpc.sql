-- 080_submit_feedback_by_token_rpc.sql
--
-- Root cause of the recurring "Something went wrong submitting your
-- feedback" failures on the public rating pages:
--
-- RatingPage.jsx / AutoRatingPage.jsx submit feedback via the generic
-- tenant-scoped db("POST", "feedback", ...) path in db.js. That path
-- refuses to send anything for a TENANT_TABLES table until a salon_id
-- has been resolved client-side into currentSalon.js's module-level
-- currentSalonId -- by design (M4 fail-closed guard, 2026-07-30 audit),
-- so it never guesses which tenant a write belongs to. That id is only
-- ever set by <SalonGate>, which is in the tree for the slug-prefixed
-- route (/:slug/rate/:token) but NOT for the legacy, still-registered
-- unslugged route (/rate/:token, see App.jsx) -- RatingPage renders
-- there with no SalonGate at all, so currentSalonId is never set and
-- every submission through that route hits the guard and fails
-- client-side, before a single request reaches Postgres.
--
-- POSApp.jsx's sendFeedbackRequest() was already fixed (2026-08-29,
-- commit 7fe8a61) to only ever generate slug-prefixed links going
-- forward, so brand-new links work. Any link generated before that
-- fix, bookmarked, or reshared still points at the dead /rate/:token
-- path and fails every time it's used -- which is what reads as
-- "keeps failing every now and then": it depends entirely on which
-- link a given customer happens to have, not on anything random.
--
-- A prior fix (commit 7fe8a61, same date) patched a different half of
-- this same guard -- the missing-device-token check -- by adding
-- 'feedback' to PRE_LOGIN_READABLE_TENANT_TABLES. Its own regression
-- test explicitly noted the salon-id half was a separate, unaffected
-- guard and left it alone. That's the gap this migration closes.
--
-- Patching the client-side guard again would only chase the next place
-- currentSalonId isn't set (any future route, any future timing issue).
-- The actual fix: feedback submission shouldn't depend on the client
-- resolving salon_id at all. The public rating pages already prove
-- ownership of a specific sale/job via an unguessable feedback_token
-- (see rating_lookup_by_token / auto_job_rating_lookup_by_token,
-- migration 055) -- salon_id can and should be resolved server-side
-- from that same token, the same way those two lookup RPCs already do.
--
-- This also tightens feedback_anon_insert while we're in here: per
-- migration 061 (the actual current definition -- verified against
-- that file, not assumed), the policy's WITH CHECK only confirms
-- salon_id references a real row in `salons`. It never checks that a
-- feedback_token exists for that salon at all. Anyone holding the
-- (public, bundled) anon key could already POST a fabricated feedback
-- row against any real salon_id directly via PostgREST, bypassing the
-- app and its token entirely. Routing submission through a
-- token-validated RPC and retiring the blanket anon INSERT policy
-- closes that too.

CREATE OR REPLACE FUNCTION public.submit_sale_feedback(
  p_token text,
  p_rating integer,
  p_note text DEFAULT NULL,
  p_stylist text DEFAULT NULL,
  p_date text DEFAULT NULL,
  p_time text DEFAULT NULL
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_salon_id uuid;
  v_client text;
  v_id uuid;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating' USING ERRCODE = '22023';
  END IF;

  SELECT s.salon_id, s.client INTO v_salon_id, v_client
  FROM public.sales s
  WHERE s.feedback_token = p_token
  LIMIT 1;

  IF v_salon_id IS NULL THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;

  IF NOT public.salon_is_bookable(v_salon_id) THEN
    RAISE EXCEPTION 'salon_unavailable' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.feedback (rating, note, stylist, client, feedback_token, date, time, salon_id)
    VALUES (p_rating, p_note, p_stylist, v_client, p_token, p_date, p_time, v_salon_id)
    RETURNING feedback.id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_feedback' USING ERRCODE = '23505';
  END;

  RETURN QUERY SELECT v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_auto_job_feedback(
  p_token text,
  p_rating integer,
  p_note text DEFAULT NULL,
  p_stylist text DEFAULT NULL,
  p_date text DEFAULT NULL,
  p_time text DEFAULT NULL
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_salon_id uuid;
  v_client text;
  v_id uuid;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating' USING ERRCODE = '22023';
  END IF;

  SELECT j.salon_id, c.name INTO v_salon_id, v_client
  FROM public.auto_jobs j
  JOIN public.customers c ON c.id = j.customer_id
  WHERE j.feedback_token = p_token
  LIMIT 1;

  IF v_salon_id IS NULL THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;

  IF NOT public.salon_is_bookable(v_salon_id) THEN
    RAISE EXCEPTION 'salon_unavailable' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.feedback (rating, note, stylist, client, feedback_token, date, time, salon_id)
    VALUES (p_rating, p_note, p_stylist, v_client, p_token, p_date, p_time, v_salon_id)
    RETURNING feedback.id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_feedback' USING ERRCODE = '23505';
  END;

  RETURN QUERY SELECT v_id;
END;
$function$;

-- Explicit revoke-from-anon, not just PUBLIC -- new functions grant
-- EXECUTE to anon/authenticated directly at creation, independent of
-- PUBLIC (see this project's own note on that gotcha, migration 055's
-- neighbors and supabase/migrations/README.md).
REVOKE ALL ON FUNCTION public.submit_sale_feedback(text, integer, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_sale_feedback(text, integer, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_sale_feedback(text, integer, text, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_auto_job_feedback(text, integer, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_auto_job_feedback(text, integer, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_auto_job_feedback(text, integer, text, text, text, text) TO anon, authenticated;

-- Superseded by the token-validated RPCs above. This policy let anyone
-- holding the (public) anon key insert an arbitrary feedback row
-- against any real, non-suspended salon_id with no token check at all
-- -- see the header note. dbDirect() no longer POSTs to `feedback`
-- directly once RatingPage.jsx / AutoRatingPage.jsx are switched to
-- the RPCs (next commit), so nothing legitimate depends on this
-- anon-INSERT policy surviving.
DROP POLICY IF EXISTS "feedback_anon_insert" ON public.feedback;
