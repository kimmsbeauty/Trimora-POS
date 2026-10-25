-- 098_pet_care_reminder_windows.sql
--
-- Trimora Pet -- preventive-care record types and configurable "due soon" windows.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply by hand only
-- after the owner says "apply 098".
--
-- 1. pet_vaccinations.record_type: 'vaccination' (default; every existing row
--    keeps it), 'deworming', 'flea-tick', 'other'. The table keeps its name.
-- 2. pet_reminder_settings: one optional row per business and record type with
--    warn_days (1 to 730). NO row = the app default of 180 days (six months).
--    A due date inside the window shows "due soon"; a date in the past shows
--    "expired", separately. The window does NOT mean a record repeats every
--    six months: the due date is still whatever the vet/staff entered.
--
-- ROLLBACK:
--   drop table if exists public.pet_reminder_settings;
--   alter table public.pet_vaccinations drop constraint if exists pet_vaccinations_record_type_chk;
--   alter table public.pet_vaccinations drop column if exists record_type;

alter table public.pet_vaccinations
  add column if not exists record_type text not null default 'vaccination';

alter table public.pet_vaccinations
  add constraint pet_vaccinations_record_type_chk
  check (record_type in ('vaccination', 'deworming', 'flea-tick', 'other'));

create table public.pet_reminder_settings (
  salon_id uuid not null references public.salons(id) on delete cascade,
  record_type text not null check (record_type in ('vaccination', 'deworming', 'flea-tick', 'other')),
  warn_days integer not null check (warn_days between 1 and 730),
  updated_at timestamptz not null default now(),
  primary key (salon_id, record_type)
);

create trigger pet_reminder_settings_touch_updated_at
  before update on public.pet_reminder_settings
  for each row execute function public.pet_touch_updated_at();

alter table public.pet_reminder_settings enable row level security;

create policy "pet_reminder_settings_select_own_salon"
  on public.pet_reminder_settings for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_reminder_settings_insert_own_salon"
  on public.pet_reminder_settings for insert to authenticated
  with check (salon_id = auth_salon_id());
create policy "pet_reminder_settings_update_own_salon"
  on public.pet_reminder_settings for update to authenticated
  using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());
create policy "pet_reminder_settings_delete_own_salon"
  on public.pet_reminder_settings for delete to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_reminder_settings from anon;
revoke truncate, references, trigger on public.pet_reminder_settings from authenticated;
