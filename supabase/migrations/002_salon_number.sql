-- Migration: 002_salon_number.sql
-- Run: 2026-06-30
-- Purpose: Add a human-readable auto-incrementing salon number so
--          salons can be referred to as #001, #002 etc. without
--          exposing or changing the internal UUID primary key.

ALTER TABLE salons ADD COLUMN IF NOT EXISTS salon_number serial;

-- After running, verify assignments:
-- SELECT salon_number, name, slug FROM salons ORDER BY salon_number;
