-- Migration: 005_salon_directory_v2.sql
-- Run: 2026-06-30
-- Purpose: Rebuild salon_directory (Super Admin view) to include
--          salon_number added in 002_salon_number.sql.
--
-- This view requires authentication and is used exclusively by
-- SuperAdminDashboard via saFetch().

DROP VIEW IF EXISTS salon_directory;

CREATE VIEW salon_directory AS
SELECT
  s.id,
  s.salon_number,
  s.name,
  s.slug,
  s.created_at,
  s.suspended,
  s.suspended_at,
  s.suspended_reason,
  ss.logo_url,
  ss.primary_color,
  ss.mpesa_till,
  ss.contact_phone,
  sub.plan AS subscription_plan,
  sub.status AS subscription_status,
  sub.expires_at AS subscription_expires_at,
  sub.amount_paid AS subscription_amount_paid,
  (SELECT count(*) FROM staff st WHERE st.salon_id = s.id) AS staff_count,
  (SELECT count(*) FROM services sv WHERE sv.salon_id = s.id) AS service_count,
  (SELECT count(*) FROM sales sa WHERE sa.salon_id = s.id) AS sale_count,
  (SELECT COALESCE(sum(sa.total), 0) FROM sales sa WHERE sa.salon_id = s.id) AS total_revenue,
  (SELECT count(*) FROM customers c WHERE c.salon_id = s.id) AS customer_count
FROM (
  (salons s LEFT JOIN salon_settings ss ON ss.salon_id = s.id)
  LEFT JOIN salon_subscriptions sub ON sub.salon_id = s.id
)
ORDER BY s.created_at DESC;
