-- 029_superadmin_auto_health_and_analytics.sql
--
-- Applied live via Supabase MCP on 2026-07-10, reconciled here.
--
-- Backs the new Auto Health and Auto Analytics views in the super admin
-- dashboard. Two pieces:
--
-- 1. salon_directory (last touched in migration 028) extended with
--    per-salon Auto operational counts: bay/active-service/job counts
--    and the most recent completed job's timestamp. Feeds
--    getAutoHealthFlags() in salonHealth.js -- reuses the dashboard's
--    existing single loadData() call, no new query.
--
-- 2. auto_platform_jobs -- new view, platform-wide read of individual
--    completed Auto jobs (salon_id, total_price, commission,
--    payment_method, completed_at). auto_jobs itself only has a
--    staff-scoped SELECT policy (salon_id = auth_salon_id()) -- there
--    was no path for the super admin to read job-level data across
--    salons at all, the same gap salon_enabled_modules had before
--    migration 028. Same guard, same grant pattern as every other admin
--    view in this file (025, 028): anon revoked entirely, authenticated
--    gets SELECT but the auth.jwt() -> 'app_metadata' ->> 'is_super_admin'
--    guard still applies per-row.
--
-- Verified live before committing: both queried successfully with a
-- simulated super-admin JWT (via set_config('request.jwt.claims', ...)
-- in a rolled-back transaction) and returned real, correct data.

CREATE OR REPLACE VIEW public.salon_directory AS
SELECT s.id, s.salon_number, s.name, s.slug, s.created_at, s.suspended, s.suspended_at, s.suspended_reason,
    ss.logo_url, ss.primary_color, ss.mpesa_till, ss.contact_phone,
    sub.plan AS subscription_plan, sub.status AS subscription_status,
    sub.expires_at AS subscription_expires_at, sub.amount_paid AS subscription_amount_paid,
    (SELECT count(*) FROM staff st WHERE st.salon_id = s.id) AS staff_count,
    (SELECT count(*) FROM services sv WHERE sv.salon_id = s.id) AS service_count,
    (SELECT count(*) FROM sales sa WHERE sa.salon_id = s.id) AS sale_count,
    (SELECT COALESCE(sum(sa.total), 0::bigint) FROM sales sa WHERE sa.salon_id = s.id) AS total_revenue,
    (SELECT count(*) FROM customers c WHERE c.salon_id = s.id) AS customer_count,
    COALESCE(auto_mod.enabled, false) AS auto_enabled,
    auto_mod.enabled_at AS auto_enabled_at,
    (SELECT count(*) FROM auto_bays ab WHERE ab.salon_id = s.id) AS auto_bay_count,
    (SELECT count(*) FROM auto_services asv WHERE asv.salon_id = s.id AND asv.active = true) AS auto_service_count,
    (SELECT count(*) FROM auto_jobs aj WHERE aj.salon_id = s.id) AS auto_job_count,
    (SELECT max(aj.completed_at) FROM auto_jobs aj WHERE aj.salon_id = s.id AND aj.status = 'completed') AS auto_last_job_completed_at
FROM salons s
LEFT JOIN salon_settings ss ON ss.salon_id = s.id
LEFT JOIN salon_subscriptions sub ON sub.salon_id = s.id
LEFT JOIN salon_enabled_modules auto_mod ON auto_mod.salon_id = s.id AND auto_mod.module_key = 'auto'
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true
ORDER BY s.created_at DESC;

CREATE OR REPLACE VIEW public.auto_platform_jobs AS
SELECT aj.id, aj.salon_id, s.name AS salon_name, aj.status, aj.total_price, aj.commission,
    aj.payment_method, aj.payment_status, aj.checked_in_at, aj.completed_at
FROM auto_jobs aj
JOIN salons s ON s.id = aj.salon_id
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true;

REVOKE ALL ON public.auto_platform_jobs FROM anon, authenticated;
GRANT SELECT ON public.auto_platform_jobs TO authenticated;
