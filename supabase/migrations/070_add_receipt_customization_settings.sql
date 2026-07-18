-- 070_add_receipt_customization_settings.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-15 (20260715102648) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


ALTER TABLE public.salon_settings
    ADD COLUMN receipt_footer_message text,
    ADD COLUMN receipt_show_staff boolean NOT NULL DEFAULT true,
    ADD COLUMN receipt_show_vehicle boolean NOT NULL DEFAULT true;
