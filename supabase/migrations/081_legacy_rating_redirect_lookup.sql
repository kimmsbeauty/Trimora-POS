-- 081_legacy_rating_redirect_lookup.sql
--
-- Supports retiring the legacy /rate/:token route (registered in
-- App.jsx alongside the current /:slug/rate/:token) as live dead
-- surface area, same category as the already-confirmed-dead unprefixed
-- /pos and /booking routes.
--
-- Rather than deleting the route outright -- which would 404 any
-- link still in circulation from before the 2026-08-29 fix that made
-- new links always slug-prefixed -- it becomes a client-side redirect:
-- resolve the slug for the token, then forward to
-- /:slug/rate/:token. This RPC is the lookup that makes that possible
-- without ever needing SalonGate or a resolved salon on the legacy
-- route (the same reasoning as submit_sale_feedback in migration 080:
-- resolve tenant identity server-side from the token, not
-- client-side).
--
-- Deliberately returns only the slug -- nothing else about the salon
-- or the underlying sale -- matching rating_lookup_by_token's existing
-- minimal-disclosure design (migration 055).

CREATE OR REPLACE FUNCTION public.salon_slug_for_feedback_token(p_token text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.slug
  FROM public.sales sa
  JOIN public.salons s ON s.id = sa.salon_id
  WHERE sa.feedback_token = p_token
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.salon_slug_for_feedback_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salon_slug_for_feedback_token(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salon_slug_for_feedback_token(text) TO anon, authenticated;
