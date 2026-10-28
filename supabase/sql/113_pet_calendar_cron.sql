-- 113_pet_calendar_cron.sql  (OPTIONAL; run by hand)
--
-- Runs the Google Calendar sync every minute, so changes reach Google without anyone pressing
-- "Sync now". Run it ONLY after: migration 113 is applied, the pet-calendar-sync function is deployed,
-- and its two secrets are set. Needs the pg_cron and pg_net extensions (Supabase > Database >
-- Extensions). The same schedule can instead be created in Supabase > Integrations > Cron.
--
-- Replace the three <PLACEHOLDERS>. <CALENDAR_SYNC_CRON_SECRET> must equal the function secret of that
-- name. Anyone who can read the cron.job table can read it, so use a value used nowhere else.
--
-- With no business switched on, each run finds nothing to do.

select cron.schedule('pet-calendar-sync', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/pet-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CALENDAR_SYNC_CRON_SECRET>'
    ),
    body := '{"action":"process"}'::jsonb
  );
$$);

-- To stop it:
--   select cron.unschedule('pet-calendar-sync');
