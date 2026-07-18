-- 076_fix_platform_stats_and_add_combined_pl.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-16 (20260716041430) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


CREATE OR REPLACE VIEW public.platform_stats AS
SELECT total_salons, active_salons, suspended_salons, total_sales,
       total_revenue, total_customers, total_bookings, total_car_washes,
       salon_revenue, auto_revenue, total_expenses, net_profit
FROM (
    SELECT
        (SELECT count(*) FROM salons WHERE business_type = 'salon') AS total_salons,
        (SELECT count(*) FROM salons WHERE business_type = 'salon' AND suspended = false) AS active_salons,
        (SELECT count(*) FROM salons WHERE business_type = 'salon' AND suspended = true) AS suspended_salons,
        ((SELECT count(*) FROM sales) +
         (SELECT count(*) FROM auto_jobs WHERE status = 'completed' AND payment_status = 'paid')) AS total_sales,
        (
          (SELECT COALESCE(sum(sales.total - COALESCE(sales.discount_amount, 0)), 0)::bigint FROM sales)
          +
          (SELECT COALESCE(sum(auto_jobs.total_price - auto_jobs.discount_amount - auto_jobs.refunded_amount), 0)::bigint
             FROM auto_jobs WHERE status = 'completed' AND payment_status = 'paid')
        ) AS total_revenue,
        (SELECT count(*) FROM customers) AS total_customers,
        (SELECT count(*) FROM bookings) AS total_bookings,
        (SELECT count(*) FROM salons WHERE business_type = 'auto') AS total_car_washes,
        (SELECT COALESCE(sum(sales.total - COALESCE(sales.discount_amount, 0)), 0)::bigint FROM sales) AS salon_revenue,
        (SELECT COALESCE(sum(auto_jobs.total_price - auto_jobs.discount_amount - auto_jobs.refunded_amount), 0)::bigint
           FROM auto_jobs WHERE status = 'completed' AND payment_status = 'paid') AS auto_revenue,
        (SELECT COALESCE(sum(expenses.amount), 0)::bigint FROM expenses) AS total_expenses,
        (
          (
            (SELECT COALESCE(sum(sales.total - COALESCE(sales.discount_amount, 0)), 0)::bigint FROM sales)
            +
            (SELECT COALESCE(sum(auto_jobs.total_price - auto_jobs.discount_amount - auto_jobs.refunded_amount), 0)::bigint
               FROM auto_jobs WHERE status = 'completed' AND payment_status = 'paid')
          )
          - (SELECT COALESCE(sum(expenses.amount), 0)::bigint FROM expenses)
        ) AS net_profit
) t
WHERE COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'is_super_admin'::text)::boolean, false) = true;
