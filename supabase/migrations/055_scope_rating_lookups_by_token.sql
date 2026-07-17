-- Fix a real, unscoped anon SELECT exposure on public_rating_lookup and
-- public_auto_job_rating_lookup (found during a follow-up sweep of the
-- 6 SECURITY DEFINER views flagged by the security advisor -- 3 of the
-- 6 already had an internal is_super_admin check and were confirmed
-- safe as-is; public_salon_directory is intentionally, safely public;
-- these 2 were the real gap).
--
-- Both views granted anon SELECT with zero row filtering built in. The
-- app itself always filters by a specific feedback_token
-- (RatingPage.jsx / AutoRatingPage.jsx used
-- ?feedback_token=eq.<token>&limit=1), but that was a client-side
-- choice, not an enforced restriction -- the same shape of bug already
-- found and fixed for public_staff_directory (migration 050) and
-- bookings_anon_update_payment_status (migration 049): anyone
-- bypassing the app UI could omit the filter entirely and pull every
-- feedback token, client name, and visit date across the whole
-- platform in one request.
--
-- Fixed the same way as those two: mandatory-argument RPC functions
-- instead of an optionally-filtered view, granted to anon (these pages
-- have no session) and authenticated. Frontend updated to match
-- (RatingPage.jsx, AutoRatingPage.jsx now call rating_lookup_by_token /
-- auto_job_rating_lookup_by_token via dbRpc instead of a filtered GET
-- on the bare view).
--
-- Applied directly to the live DB and verified 2026-07-17: correct
-- token returns exactly the matching row (tested against real,
-- existing data, read-only), incorrect token returns zero rows, and
-- the underlying views' full row counts (19 sales, several auto jobs)
-- are confirmed unreachable via anon/authenticated after the grant
-- revocation. Full test suite (187/187) and production build both
-- verified clean after the frontend changes.
--
-- Also corrects a stale/inaccurate comment in
-- src/lib/tenantScoping.test.js that claimed these two views weren't
-- queried via the dbDirect GET path -- they were.

CREATE OR REPLACE FUNCTION public.rating_lookup_by_token(p_token text)
 RETURNS TABLE(feedback_token text, client text, date text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT feedback_token, client, date
  FROM sales
  WHERE sales.feedback_token = p_token
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.auto_job_rating_lookup_by_token(p_token text)
 RETURNS TABLE(feedback_token text, client text, date date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT j.feedback_token, c.name AS client, (j.completed_at)::date AS date
  FROM auto_jobs j
  JOIN customers c ON c.id = j.customer_id
  WHERE j.feedback_token = p_token
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.rating_lookup_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_job_rating_lookup_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rating_lookup_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_job_rating_lookup_by_token(text) TO anon, authenticated;

-- Close the actual leak: the views themselves no longer need anon/
-- authenticated SELECT now that the RPCs above cover the legitimate
-- use case.
REVOKE SELECT ON public.public_rating_lookup FROM anon, authenticated, PUBLIC;
REVOKE SELECT ON public.public_auto_job_rating_lookup FROM anon, authenticated, PUBLIC;
