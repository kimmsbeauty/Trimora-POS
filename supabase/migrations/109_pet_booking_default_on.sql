-- 109_pet_booking_default_on.sql
--
-- Trimora Pet: online booking is ON by default for pet businesses, like the salon booking link.
--
-- STATUS: APPLIED to production 2026-10-26 (recorded by Supabase as "109_pet_booking_default_on",
-- version 20261026162220). This file was committed afterwards from the statements Supabase recorded;
-- the SQL below the header is byte-for-byte what ran (verified by hash).
--
-- WHAT IT DOES
--   * pet_ensure_public_booking_defaults(salon): creates a pet_public_booking_settings row (enabled,
--     Africa/Nairobi, 30 min slots, 4 h notice, 30 days ahead, capacity 1, Mon-Fri 09-17, Sat 09-13)
--     ONLY when none exists. Never changes an existing row.
--   * A trigger on salon_enabled_modules calls it when the pet module is enabled for a business.
--   * Backfills existing, non-suspended pet businesses that have the pet module on and no settings row.
--   * Both functions are not callable by anon, authenticated or public.
--
-- ROLLBACK (settings rows already created are left in place; delete them by hand if wanted):
--   drop trigger if exists pet_booking_defaults_on_module on public.salon_enabled_modules;
--   drop function if exists public.pet_booking_defaults_trigger();
--   drop function if exists public.pet_ensure_public_booking_defaults(uuid);

create or replace function public.pet_ensure_public_booking_defaults(p_salon uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.pet_public_booking_settings
    (salon_id, enabled, timezone, slot_minutes, lead_hours, max_days_ahead, capacity, hours)
  select s.id, true, 'Africa/Nairobi', 30, 4, 30, 1,
    '[{"weekday":1,"open":"09:00","close":"17:00"},
      {"weekday":2,"open":"09:00","close":"17:00"},
      {"weekday":3,"open":"09:00","close":"17:00"},
      {"weekday":4,"open":"09:00","close":"17:00"},
      {"weekday":5,"open":"09:00","close":"17:00"},
      {"weekday":6,"open":"09:00","close":"13:00"}]'::jsonb
  from public.salons s
  where s.id = p_salon and s.business_type = 'pet'
  on conflict (salon_id) do nothing;
end;
$$;

create or replace function public.pet_booking_defaults_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.module_key = 'pet' and new.enabled then
    perform public.pet_ensure_public_booking_defaults(new.salon_id);
  end if;
  return null;
end;
$$;

create trigger pet_booking_defaults_on_module
  after insert or update of enabled on public.salon_enabled_modules
  for each row execute function public.pet_booking_defaults_trigger();

revoke all on function public.pet_ensure_public_booking_defaults(uuid) from public, anon, authenticated;
revoke all on function public.pet_booking_defaults_trigger() from public, anon, authenticated;

select public.pet_ensure_public_booking_defaults(s.id)
from public.salons s
where s.business_type = 'pet'
  and not coalesce(s.suspended, false)
  and exists (select 1 from public.salon_enabled_modules m
              where m.salon_id = s.id and m.module_key = 'pet' and m.enabled)
  and not exists (select 1 from public.pet_public_booking_settings b where b.salon_id = s.id);
