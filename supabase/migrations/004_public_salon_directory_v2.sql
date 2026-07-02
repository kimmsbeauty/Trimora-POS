-- Migration: 004_public_salon_directory_v2.sql
-- Run: 2026-06-30
-- Purpose: Rebuild public_salon_directory to expose new payment method
--          columns added in 003_payment_methods.sql, and salon_number
--          added in 002_salon_number.sql.
--
-- This view is anon-readable and used by:
--   - BookingPage (public booking flow)
--   - DeviceGate / SalonGate (pre-auth salon resolution)
--   - fetchPublicSalonBranding()

DROP VIEW IF EXISTS public_salon_directory;

CREATE VIEW public_salon_directory AS
SELECT
  s.slug,
  s.name,
  s.id,
  s.suspended,
  ss.primary_color,
  ss.secondary_color,
  ss.logo_url,
  ss.tagline,
  ss.mpesa_till,
  ss.mpesa_name,
  ss.contact_phone,
  ss.mpesa_paybill,
  ss.mpesa_account,
  ss.mpesa_send_money_phone,
  ss.enabled_payment_methods
FROM salons s
LEFT JOIN salon_settings ss ON (ss.salon_id = s.id);
