-- Fixes a regression introduced by the search_path-pinning migration
-- (026, applied 2026-07-09 by a separate concurrent session): pinning
-- search_path to 'public, pg_temp' on SECURITY DEFINER functions broke
-- any function that internally calls pgcrypto (crypt/gen_salt), because
-- pgcrypto lives in the `extensions` schema on this project, not public.
--
-- Affected: verify_staff_pin (regular login), update_salon_pin,
-- super_admin_reset_salon_pin, complete_salon_onboarding (new salon
-- signup). All four confirmed broken by direct reproduction: calling
-- crypt()/gen_salt() under search_path='public, pg_temp' throws
-- "42883: function gen_salt(unknown, integer) does not exist".
-- PostgREST maps that Postgres error code to HTTP 404, which is why
-- this looked like a routing/cache problem rather than an execution
-- error -- a full project pause/restore did not fix it, confirming it
-- was never a cache issue.
--
-- Verified via a full sweep of all 20 SECURITY DEFINER functions in
-- public for any unqualified call to a function living in `extensions`
-- (pgcrypto, uuid-ossp, pg_stat_statements) -- these 4 are the only
-- ones affected. verify_pin_for_salon was also checked: it uses
-- built-in md5(), not pgcrypto, so it was never at risk from this bug
-- (it is also dead code, unreferenced anywhere in src/, unrelated
-- cleanup item, not touched here).

alter function public.verify_staff_pin(p_role text, p_pin text) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.update_salon_pin(p_role text, p_new_pin text) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.super_admin_reset_salon_pin(p_salon_id uuid, p_role text, p_new_pin text) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.complete_salon_onboarding(p_salon_name text, p_slug text, p_staff_pin text, p_admin_pin text, p_token text) set search_path to 'public', 'extensions', 'pg_temp';
