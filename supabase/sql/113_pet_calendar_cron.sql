-- 113_pet_calendar_cron.sql  (run by hand; ALREADY RUN on production 2026-10-29)
--
-- Runs the Google Calendar sync every minute, so changes reach Google without anyone pressing "Sync now".
-- Run it ONLY after: migrations 113 and 115 are applied and the pet-calendar-sync function (version 4 or later)
-- is deployed.
--
-- The shared secret lives in Vault and is generated in the database, so it is never typed, pasted or stored in
-- the cron job text (the job reads it at run time, and the function checks it with pet_calendar_cron_secret_ok).
-- 1. Prerequisites (once):
--      create extension if not exists pg_cron;
--      create extension if not exists pg_net with schema extensions;
--      select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'calendar_sync_cron_secret',
--        'Shared secret for the pet-calendar-sync scheduler');
-- 2. Schedule it. Replace the two <PLACEHOLDERS> (the project ref, and the project's anon key, which is public):

select cron.schedule('pet-calendar-sync', '* * * * *', $job$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/pet-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_sync_cron_secret')
    ),
    body := '{"action":"process"}'::jsonb
  );
$job$);

-- Check it:   select status, start_time from cron.job_run_details order by start_time desc limit 5;
--             select status_code, content from net._http_response order by created desc limit 5;
-- To stop it: select cron.unschedule('pet-calendar-sync');
