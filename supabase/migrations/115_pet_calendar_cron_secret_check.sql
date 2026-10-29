-- 115_pet_calendar_cron_secret_check.sql
--
-- STATUS: APPLIED to production 2026-10-29 (recorded as `pet_calendar_cron_secret_check`).
--
-- Lets pet-calendar-sync check the scheduler's x-cron-secret against the copy in Vault, so no second copy has
-- to be pasted into the Edge Function secrets. Only the service role (the function) can call it; it returns
-- true/false and never returns the secret. ADDITIVE: one function.
--
-- ROLLBACK:
--   drop function if exists public.pet_calendar_cron_secret_ok(text);
--   (the function then only accepts the CALENDAR_SYNC_CRON_SECRET function secret again)

create or replace function public.pet_calendar_cron_secret_ok(p_secret text) returns boolean
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select coalesce(
    nullif(p_secret, '') is not null
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'calendar_sync_cron_secret' and decrypted_secret = p_secret
    ),
    false
  );
$$;

revoke all on function public.pet_calendar_cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.pet_calendar_cron_secret_ok(text) to service_role;
