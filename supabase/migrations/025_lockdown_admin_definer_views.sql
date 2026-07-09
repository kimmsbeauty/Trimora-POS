-- 025_lockdown_admin_definer_views.sql
--
-- CRITICAL FIX. Applied live via Supabase MCP on 2026-07-09 during a
-- security-baseline remediation session, then reconciled here.
--
-- Found via get_advisors(security): `platform_stats` and `salon_directory`
-- are SECURITY DEFINER views with NO internal access check and, per
-- information_schema.table_privileges, `anon` had direct SELECT (plus,
-- oddly, INSERT/UPDATE/DELETE/TRUNCATE) granted on both. That means any
-- unauthenticated request carrying only the public anon API key --
-- trivially readable from the deployed frontend bundle, no login
-- required at all -- could read:
--   - platform_stats: total revenue, total sales, total customers,
--     total bookings, aggregated across every tenant on the platform.
--   - salon_directory: per-salon revenue, subscription plan/status/
--     amount_paid, M-Pesa till number, contact phone, staff/service/
--     sale/customer counts, for every one of the 4 live salons.
-- The app's own super-admin login screen (superAdminAuth.js) checks
-- app_metadata.is_super_admin client-side after a normal Supabase Auth
-- session is issued, but that check was never enforced at the database
-- level -- the views themselves had no equivalent guard, so the login
-- screen was cosmetic from the database's point of view. Confirmed via
-- grep of src/ that saFetch() (SuperAdminDashboard.jsx) is the only
-- consumer; no other code path relies on unauthenticated access to
-- either view.
--
-- Fix mirrors the exact pattern already used by suspend_salon() and
-- other super_admin_* RPCs in this codebase:
--   coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
-- Embedded as a WHERE guard (views can't raise exceptions the way an
-- RPC can, so non-admins get zero rows back rather than a 403 -- no
-- data is exposed either way). Chosen over converting to RPCs to avoid
-- touching SuperAdminDashboard.jsx's existing REST-style saFetch calls.
--
-- Also revoked: anon and authenticated both had INSERT/UPDATE/DELETE/
-- TRUNCATE on public_salon_directory and public_rating_lookup, even
-- though the app only ever SELECTs from either. Revoked down to SELECT-
-- only, least privilege, no behavior change for legitimate use.
--
-- NOT changed: public_salon_directory, public_rating_lookup, and
-- public_staff_directory remain SECURITY DEFINER with anon SELECT --
-- that's intentional by design (public booking pages need to read
-- salon branding/M-Pesa details, and a customer's rating lookup needs
-- anon access via an unguessable 96-bit crypto-random token). The
-- get_advisors(security) linter will keep flagging all 5 views as
-- "SECURITY DEFINER" ERROR regardless -- that's a blanket rule that
-- can't see the internal guard added here, treat platform_stats/
-- salon_directory's ERROR as resolved-but-still-shown, not unresolved.

CREATE OR REPLACE VIEW public.platform_stats AS
SELECT * FROM (
  SELECT
    (SELECT count(*) FROM salons) AS total_salons,
    (SELECT count(*) FROM salons WHERE salons.suspended = false) AS active_salons,
    (SELECT count(*) FROM salons WHERE salons.suspended = true) AS suspended_salons,
    (SELECT count(*) FROM sales) AS total_sales,
    (SELECT COALESCE(sum(sales.total), 0::bigint) FROM sales) AS total_revenue,
    (SELECT count(*) FROM customers) AS total_customers,
    (SELECT count(*) FROM bookings) AS total_bookings
) t
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true;

CREATE OR REPLACE VIEW public.salon_directory AS
SELECT s.id, s.salon_number, s.name, s.slug, s.created_at, s.suspended, s.suspended_at, s.suspended_reason,
    ss.logo_url, ss.primary_color, ss.mpesa_till, ss.contact_phone,
    sub.plan AS subscription_plan, sub.status AS subscription_status,
    sub.expires_at AS subscription_expires_at, sub.amount_paid AS subscription_amount_paid,
    (SELECT count(*) FROM staff st WHERE st.salon_id = s.id) AS staff_count,
    (SELECT count(*) FROM services sv WHERE sv.salon_id = s.id) AS service_count,
    (SELECT count(*) FROM sales sa WHERE sa.salon_id = s.id) AS sale_count,
    (SELECT COALESCE(sum(sa.total), 0::bigint) FROM sales sa WHERE sa.salon_id = s.id) AS total_revenue,
    (SELECT count(*) FROM customers c WHERE c.salon_id = s.id) AS customer_count
FROM salons s
LEFT JOIN salon_settings ss ON ss.salon_id = s.id
LEFT JOIN salon_subscriptions sub ON sub.salon_id = s.id
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true
ORDER BY s.created_at DESC;

REVOKE ALL ON public.platform_stats FROM anon, authenticated;
REVOKE ALL ON public.salon_directory FROM anon, authenticated;
GRANT SELECT ON public.platform_stats TO authenticated;
GRANT SELECT ON public.salon_directory TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.public_salon_directory FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.public_rating_lookup FROM anon, authenticated;
