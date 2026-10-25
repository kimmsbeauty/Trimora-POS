-- 098_rollback_pet_reminder_settings.sql -- MANUAL script, never applied automatically.
-- Removes the per-record-type reminder settings (the app falls back to its 180-day default).
drop function if exists public.pet_delete_reminder_setting(uuid);
drop function if exists public.pet_save_reminder_setting(text, integer);
drop table if exists public.pet_reminder_settings;
