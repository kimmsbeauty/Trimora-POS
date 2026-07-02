-- Migration: 003_payment_methods.sql
-- Run: 2026-06-30
-- Purpose: Add multiple M-Pesa payment method support to salon_settings.
--          Salons can now configure Till, Paybill, Send Money, or Cash
--          and enable/disable each independently. Booking page shows only
--          the methods each salon has enabled.
--
-- NOTE: The existing mpesa_till and mpesa_name columns are PRESERVED.
--       STK Push infrastructure continues to use mpesa_till.

ALTER TABLE salon_settings
  ADD COLUMN IF NOT EXISTS mpesa_paybill text,
  ADD COLUMN IF NOT EXISTS mpesa_account text,
  ADD COLUMN IF NOT EXISTS mpesa_send_money_phone text,
  ADD COLUMN IF NOT EXISTS enabled_payment_methods text[] DEFAULT ARRAY['Cash', 'Till'];

-- After running, update public_salon_directory and salon_directory
-- views to expose these new columns (see 004_ and 005_ migrations).
