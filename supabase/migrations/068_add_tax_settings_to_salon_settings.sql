-- 068_add_tax_settings_to_salon_settings.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-15 (20260715044723) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


ALTER TABLE public.salon_settings
    ADD COLUMN tax_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN tax_rate integer NOT NULL DEFAULT 16 CHECK (tax_rate >= 0 AND tax_rate <= 100),
    ADD COLUMN tax_pin text;
