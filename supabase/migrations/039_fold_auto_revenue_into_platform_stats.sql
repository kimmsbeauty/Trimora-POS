-- Bug fix: platform_stats.total_revenue/total_sales and
-- salon_directory.total_revenue/sale_count were computed only from the
-- `sales` table, which predates the Auto (car-wash) module. Car-wash
-- revenue lives in auto_jobs.total_price, a completely separate table,
-- so any salon with business_type='auto' showed KES 0 / 0 sales on the
-- super admin dashboard's platform-wide and per-salon cards despite
-- having real, paid business -- confirmed live against "High point
-- carwash" (id 3e1df0af-1d66-4a6c-a164-a9f0cc7a0dc2): 8 completed,
-- paid auto_jobs totaling KES 8,100, but salon_directory reported
-- sale_count=0, total_revenue=0 for that row, and platform_stats
-- undercounted the platform total by the same amount.
--
-- Fix: add auto_jobs revenue/count into both views' existing
-- total_revenue/total_sales/sale_count columns (column list/order is
-- unchanged -- CREATE OR REPLACE VIEW only disallows renaming/removing/
-- reordering columns, not changing how an existing column is computed).
--
-- Definition chosen for "counts as revenue": auto_jobs rows with
-- status='completed' AND payment_status='paid'. This intentionally
-- differs from the existing autoRevenueByMonth/autoRevenueBySalon
-- (src/lib/salonHealth.js), which count any status='completed' job
-- regardless of payment_status -- that logic feeds the dedicated Auto
-- tab's own "Total Auto Revenue" card, a different, already-shipped
-- surface not touched by this migration. paid-only was chosen here to
-- match the `sales` table's own semantics: a `sales` row only ever
-- exists once payment is finalized, there is no "completed but unpaid"
-- state in that table, so the closest analog for auto_jobs is
-- payment_status='paid', not just status='completed'. For the one
-- live car-wash salon today all 8 completed jobs are already paid, so
-- this choice does not change today's numbers -- it only matters once
-- an unpaid completed job exists.
--
-- This is a read-only view change: no data is modified, no RLS
-- policies are touched, and the super-admin-only WHERE guard from
-- migration 025/035 is preserved unchanged on both views.

CREATE OR REPLACE VIEW public.salon_directory AS
SELECT s.id, s.salon_number, s.name, s.slug, s.created_at, s.suspended, s.suspended_at, s.suspended_reason,
    ss.logo_url, ss.primary_color, ss.mpesa_till, ss.contact_phone,
    sub.plan AS subscription_plan, sub.status AS subscription_status,
    sub.expires_at AS subscription_expires_at, sub.amount_paid AS subscription_amount_paid,
    (SELECT count(*) FROM staff st WHERE st.salon_id = s.id) AS staff_count,
    (SELECT count(*) FROM services sv WHERE sv.salon_id = s.id) AS service_count,
    (SELECT count(*) FROM sales sa WHERE sa.salon_id = s.id)
      + (SELECT count(*) FROM auto_jobs aj WHERE aj.salon_id = s.id AND aj.status = 'completed' AND aj.payment_status = 'paid') AS sale_count,
    (SELECT COALESCE(sum(sa.total), 0::bigint) FROM sales sa WHERE sa.salon_id = s.id)
      + (SELECT COALESCE(sum(aj.total_price), 0::bigint) FROM auto_jobs aj WHERE aj.salon_id = s.id AND aj.status = 'completed' AND aj.payment_status = 'paid') AS total_revenue,
    (SELECT count(*) FROM customers c WHERE c.salon_id = s.id) AS customer_count,
    COALESCE(auto_mod.enabled, false) AS auto_enabled,
    auto_mod.enabled_at AS auto_enabled_at,
    (SELECT count(*) FROM auto_bays ab WHERE ab.salon_id = s.id) AS auto_bay_count,
    (SELECT count(*) FROM auto_services asv WHERE asv.salon_id = s.id AND asv.active = true) AS auto_service_count,
    (SELECT count(*) FROM auto_jobs aj WHERE aj.salon_id = s.id) AS auto_job_count,
    (SELECT max(aj.completed_at) FROM auto_jobs aj WHERE aj.salon_id = s.id AND aj.status = 'completed') AS auto_last_job_completed_at,
    s.business_type
FROM salons s
LEFT JOIN salon_settings ss ON ss.salon_id = s.id
LEFT JOIN salon_subscriptions sub ON sub.salon_id = s.id
LEFT JOIN salon_enabled_modules auto_mod ON auto_mod.salon_id = s.id AND auto_mod.module_key = 'auto'
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true
ORDER BY s.created_at DESC;

CREATE OR REPLACE VIEW public.platform_stats AS
SELECT * FROM (
  SELECT
    (SELECT count(*) FROM salons WHERE business_type = 'salon') AS total_salons,
    (SELECT count(*) FROM salons WHERE business_type = 'salon' AND salons.suspended = false) AS active_salons,
    (SELECT count(*) FROM salons WHERE business_type = 'salon' AND salons.suspended = true) AS suspended_salons,
    (SELECT count(*) FROM sales)
      + (SELECT count(*) FROM auto_jobs WHERE status = 'completed' AND payment_status = 'paid') AS total_sales,
    (SELECT COALESCE(sum(sales.total), 0::bigint) FROM sales)
      + (SELECT COALESCE(sum(auto_jobs.total_price), 0::bigint) FROM auto_jobs WHERE status = 'completed' AND payment_status = 'paid') AS total_revenue,
    (SELECT count(*) FROM customers) AS total_customers,
    (SELECT count(*) FROM bookings) AS total_bookings,
    (SELECT count(*) FROM salons WHERE business_type = 'auto') AS total_car_washes
) t
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true;
