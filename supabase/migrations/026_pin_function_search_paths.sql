-- 026_pin_function_search_paths.sql
--
-- Applied live via Supabase MCP on 2026-07-09, reconciled here.
--
-- Fixes all 18 findings from get_advisors(security) at the WARN level
-- "Function Search Path Mutable" -- every SECURITY DEFINER function in
-- public had no explicit search_path, leaving it resolvable at call
-- time via whatever search_path the calling session has set. Pinning it
-- to `public, pg_temp` closes the classic search_path-hijack vector
-- (a malicious session creating same-named objects in a schema that
-- would otherwise resolve first) without changing any function's
-- behavior -- every function here only ever references public-schema
-- objects.
--
-- No schema/data change. Verified live post-apply: check_pin_lockout()
-- and auth_salon_id() both still execute and return correct results;
-- full test suite (147/147) still passes.

ALTER FUNCTION public.auth_salon_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_pin_lockout(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.complete_salon_onboarding(text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.consume_invite(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_invite(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_admin_audit_log(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_today_staff_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_admin_action(text, uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.reactivate_salon(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.record_subscription_payment(uuid, text, numeric, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.super_admin_reset_salon_pin(uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.super_admin_update_plan_price(text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.super_admin_update_salon(uuid, text, text, text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.suspend_salon(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_salon_pin(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_invite(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_pin_for_salon(uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_staff_pin(text, text) SET search_path = public, pg_temp;
