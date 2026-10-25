-- 098_pet_reminder_settings.sql   (number is PROVISIONAL: check every branch before applying)
--
-- Trimora Pet -- how far ahead the app starts showing a "due soon" reminder for a
-- vaccination or other preventive-care record, configurable PER RECORD TYPE
-- (e.g. Rabies, Deworming). The vaccination's own due date is untouched; this only
-- decides when a reminder appears. An EXPIRED date is always flagged separately.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 098". Independent of 097 (either can go first).
--
-- DEFAULT: with no row for a record type the app uses 180 days (six months). That is
-- a reminder WINDOW, not a due interval: it does not imply anything is due every
-- six months. A record with no due date never produces a reminder.
--
-- ROLLBACK: supabase/sql/098_rollback_pet_reminder_settings.sql
-- (drops the table and two functions; nothing else depends on them).

create table public.pet_reminder_settings (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  record_type text not null check (btrim(record_type) <> '' and char_length(record_type) <= 60),
  window_days integer not null check (window_days between 1 and 730),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pet_reminder_settings_type_uniq
  on public.pet_reminder_settings (salon_id, lower(btrim(record_type)));

create trigger pet_reminder_settings_touch_updated_at before update on public.pet_reminder_settings
  for each row execute function public.pet_touch_updated_at();
create trigger pet_reminder_settings_audit after insert or update or delete on public.pet_reminder_settings
  for each row execute function public.pet_audit_row();

alter table public.pet_reminder_settings enable row level security;
create policy "pet_reminder_settings_select_own_salon" on public.pet_reminder_settings for select to authenticated
  using (salon_id = auth_salon_id());

-- Read-only for the app; all writes go through the two functions below.
revoke all on public.pet_reminder_settings from anon;
revoke all on public.pet_reminder_settings from authenticated;
grant select on public.pet_reminder_settings to authenticated;

-- Errors: NOT_AUTHENTICATED, INVALID_RECORD_TYPE, INVALID_WINDOW, SETTING_NOT_FOUND.
create or replace function public.pet_save_reminder_setting(p_record_type text, p_window_days integer)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_type text := btrim(coalesce(p_record_type, ''));
  v_id uuid;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_type = '' or char_length(v_type) > 60 then raise exception 'INVALID_RECORD_TYPE'; end if;
  if p_window_days is null or p_window_days < 1 or p_window_days > 730 then raise exception 'INVALID_WINDOW'; end if;
  insert into public.pet_reminder_settings (salon_id, record_type, window_days)
  values (v_salon, v_type, p_window_days)
  on conflict (salon_id, lower(btrim(record_type)))
  do update set window_days = excluded.window_days, record_type = excluded.record_type
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.pet_delete_reminder_setting(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.pet_reminder_settings where id = p_id and salon_id = v_salon;
  if not found then raise exception 'SETTING_NOT_FOUND'; end if;
end;
$$;

revoke execute on function public.pet_save_reminder_setting(text, integer) from public, anon;
revoke execute on function public.pet_delete_reminder_setting(uuid) from public, anon;
grant execute on function public.pet_save_reminder_setting(text, integer) to authenticated;
grant execute on function public.pet_delete_reminder_setting(uuid) to authenticated;
