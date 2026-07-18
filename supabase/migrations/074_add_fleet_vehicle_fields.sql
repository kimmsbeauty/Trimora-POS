-- 074_add_fleet_vehicle_fields.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-16 (20260716035524) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


ALTER TABLE public.auto_vehicles
    ADD COLUMN is_fleet boolean NOT NULL DEFAULT false,
    ADD COLUMN fleet_name text;
