-- 114_pet_daycare.sql
--
-- Trimora Pet -- Daycare management (visits, care log, capacity, checkout billing).
--
-- STATUS: written for owner review. NOT applied to production. Test it on a branch or the PGlite
-- suite (src/pages/pet/migration114.db.test.js) first; apply by hand only after "apply 114".
--
-- ADDITIVE: three tables, one column + index on pet_invoices, a WIDENED (superset) category check on
-- pet_services, and RPCs. Salon, Auto, grooming and boarding behaviour is unchanged.
--
-- DESIGN
--   * Rates live in the existing catalogue: pet_services gains category 'Daycare' (no duration, so the
--     public online-booking SQL, which requires a duration, never lists them). pet_daycare_settings maps
--     the three plans (full day, half day, hourly) to Daycare services. A plan with no service is simply
--     not offered. Nothing is invented: capacity, grace and late fees start UNSET / OFF.
--   * Visit lifecycle: booked -> checked-in -> in-daycare -> ready-for-pickup -> completed;
--     booked -> cancelled | no-show. 'completed' is reachable only through pet_daycare_checkout, which
--     also creates the invoice in the same transaction (reusing pet_invoices / pet_invoice_lines, so
--     payment happens in the existing Invoices screen). One live invoice per visit (unique index).
--   * Capacity is checked inside the write functions under a per-business advisory lock, using the PEAK
--     number of pets present at once during the requested window. Pets still on site past their
--     scheduled end keep occupying a place. A pet cannot have two overlapping active visits (exclusion
--     constraint) nor a daycare visit during an active boarding stay.
--   * Billing policy (mirrors boarding): the BOOKED visit is charged (early pickup changes nothing).
--     Late pickup is charged only if the business switched it on; each started hour after the scheduled
--     end plus the grace period is billed at the hourly service price. Staff may reduce, never raise.
--   * Writes: clients can only SELECT. Staff attribution uses the X-Pet-Actor header (migration 087):
--     attribution, NOT authentication. Policy settings need the admin PIN (wrong PIN returns null).
--   * Care log rows are append-only (no update / delete); correct a mistake with a new note.
--   * NOT included: recurring bookings, reminders and Google Calendar events for daycare (their tables
--     are constrained to booking / stay and need a separate change).
--
-- ROLLBACK (destroys daycare data only):
--   drop function if exists public.pet_daycare_checkout(uuid, uuid, integer, text, numeric, date, text);
--   drop function if exists public.pet_daycare_billing(uuid);
--   drop function if exists public.pet_daycare_add_log(uuid, text, text, text, text, timestamptz);
--   drop function if exists public.pet_daycare_set_status(uuid, text);
--   drop function if exists public.pet_daycare_update_visit(uuid, timestamptz, timestamptz, uuid, text, text);
--   drop function if exists public.pet_daycare_create_visit(uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, boolean);
--   drop function if exists public.pet_daycare_save_settings(text, integer, uuid, uuid, uuid, integer, boolean);
--   drop function if exists public.pet_daycare_check_slot(uuid, uuid, timestamptz, timestamptz, uuid);
--   drop function if exists public.pet_daycare_peak(uuid, timestamptz, timestamptz, uuid);
--   drop function if exists public.pet_daycare_units(text, timestamptz, timestamptz);
--   drop function if exists public.pet_daycare_actor(uuid);
--   drop function if exists public.pet_daycare_logs_immutable();
--   drop index if exists public.pet_invoices_daycare_live_uidx;
--   alter table public.pet_invoices drop column if exists daycare_visit_id;
--   drop table if exists public.pet_daycare_care_logs, public.pet_daycare_visits, public.pet_daycare_settings;
--   (pet_services category check can stay widened; or re-add the 3-value check once no Daycare rows exist.)

create extension if not exists btree_gist with schema extensions;

-- 1. Catalogue: allow category 'Daycare' (superset of the old check), never with a duration.
alter table public.pet_services drop constraint if exists pet_services_category_check;
alter table public.pet_services add constraint pet_services_category_check
  check (category in ('Grooming', 'Boarding', 'Add-on', 'Daycare'));
alter table public.pet_services add constraint pet_services_daycare_no_duration
  check (category <> 'Daycare' or duration_minutes is null);

-- 2. Tables
create table public.pet_daycare_settings (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null unique references public.salons(id) on delete cascade,
  capacity integer check (capacity is null or capacity between 1 and 500),
  full_day_service_id uuid references public.pet_services(id) on delete set null,
  half_day_service_id uuid references public.pet_services(id) on delete set null,
  hourly_service_id uuid references public.pet_services(id) on delete set null,
  overdue_grace_minutes integer not null default 0 check (overdue_grace_minutes between 0 and 1440),
  late_fee_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_daycare_late_fee_needs_hourly check (not late_fee_enabled or hourly_service_id is not null)
);

create table public.pet_daycare_visits (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  pet_id uuid not null references public.pet_pets(id) on delete restrict,
  plan text not null check (plan in ('full_day', 'half_day', 'hourly')),
  service_id uuid references public.pet_services(id) on delete set null,
  service_name text not null check (btrim(service_name) <> ''),
  unit_price integer not null check (unit_price >= 0 and unit_price <= 10000000),
  units integer not null check (units between 1 and 24),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked', 'checked-in', 'in-daycare', 'ready-for-pickup', 'completed', 'cancelled', 'no-show')),
  assigned_staff_id uuid references public.staff(id) on delete set null,
  customer_instructions text check (customer_instructions is null or char_length(customer_instructions) <= 500),
  notes text check (notes is null or char_length(notes) <= 500),
  checked_in_at timestamptz,
  checked_in_by uuid references public.staff(id) on delete set null,
  ready_at timestamptz,
  collected_at timestamptz,
  collected_by uuid references public.staff(id) on delete set null,
  cancelled_at timestamptz,
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_daycare_valid_window check (scheduled_end > scheduled_start and scheduled_end - scheduled_start <= interval '24 hours'),
  constraint pet_daycare_arrival_recorded check (status in ('booked', 'cancelled', 'no-show') or checked_in_at is not null),
  constraint pet_daycare_collection_recorded check (status <> 'completed' or collected_at is not null),
  constraint pet_daycare_no_pet_overlap exclude using gist (
    pet_id with =,
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  ) where (status in ('booked', 'checked-in', 'in-daycare', 'ready-for-pickup'))
);
create index pet_daycare_visits_salon_start_idx on public.pet_daycare_visits (salon_id, scheduled_start);
create index pet_daycare_visits_pet_idx on public.pet_daycare_visits (pet_id);
create index pet_daycare_visits_customer_idx on public.pet_daycare_visits (customer_id);

create table public.pet_daycare_care_logs (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  visit_id uuid not null references public.pet_daycare_visits(id) on delete cascade,
  kind text not null check (kind in ('feeding', 'water', 'play', 'rest', 'toileting', 'medication', 'behaviour', 'incident', 'note')),
  details text check (details is null or char_length(details) <= 500),
  medication_name text check (medication_name is null or char_length(medication_name) <= 100),
  dose text check (dose is null or char_length(dose) <= 100),
  occurred_at timestamptz not null default now(),
  recorded_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pet_daycare_med_fields check (kind <> 'medication' or (btrim(coalesce(medication_name, '')) <> '' and btrim(coalesce(dose, '')) <> '')),
  constraint pet_daycare_note_text check (kind not in ('behaviour', 'incident', 'note') or btrim(coalesce(details, '')) <> '')
);
create index pet_daycare_logs_visit_idx on public.pet_daycare_care_logs (visit_id, occurred_at);
create index pet_daycare_logs_salon_idx on public.pet_daycare_care_logs (salon_id);

create or replace function public.pet_daycare_logs_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.pet_daycare_visits v where v.id = old.visit_id) then
    return old; -- cascade from deleting the visit / business
  end if;
  raise exception 'Daycare care log entries cannot be changed';
end;
$$;
create trigger pet_daycare_logs_no_change before update or delete on public.pet_daycare_care_logs
  for each row execute function public.pet_daycare_logs_immutable();

-- Billing link: one live (non-void) invoice per visit.
alter table public.pet_invoices add column if not exists daycare_visit_id uuid references public.pet_daycare_visits(id);
create unique index if not exists pet_invoices_daycare_live_uidx
  on public.pet_invoices (salon_id, daycare_visit_id) where daycare_visit_id is not null and status <> 'void';

create trigger pet_daycare_settings_touch before update on public.pet_daycare_settings
  for each row execute function public.pet_touch_updated_at();
create trigger pet_daycare_visits_touch before update on public.pet_daycare_visits
  for each row execute function public.pet_touch_updated_at();
create trigger pet_daycare_settings_audit after insert or update or delete on public.pet_daycare_settings
  for each row execute function public.pet_audit_row();
create trigger pet_daycare_visits_audit after insert or update or delete on public.pet_daycare_visits
  for each row execute function public.pet_audit_row();
create trigger pet_daycare_logs_audit after insert on public.pet_daycare_care_logs
  for each row execute function public.pet_audit_row();
create trigger pet_daycare_visits_archived_guard before insert on public.pet_daycare_visits
  for each row execute function public.pet_block_archived_pet();

-- 3. RLS: read-only for the client.
alter table public.pet_daycare_settings enable row level security;
alter table public.pet_daycare_visits enable row level security;
alter table public.pet_daycare_care_logs enable row level security;
create policy pet_daycare_settings_select_own_salon on public.pet_daycare_settings for select to authenticated using (salon_id = auth_salon_id());
create policy pet_daycare_visits_select_own_salon on public.pet_daycare_visits for select to authenticated using (salon_id = auth_salon_id());
create policy pet_daycare_logs_select_own_salon on public.pet_daycare_care_logs for select to authenticated using (salon_id = auth_salon_id());
revoke all on public.pet_daycare_settings, public.pet_daycare_visits, public.pet_daycare_care_logs from anon, authenticated;
grant select on public.pet_daycare_settings, public.pet_daycare_visits, public.pet_daycare_care_logs to authenticated;

-- 4. Internal helpers (not client-callable).
create or replace function public.pet_daycare_actor(p_salon uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hdr text; v_id uuid;
begin
  begin
    v_hdr := nullif(btrim(coalesce((current_setting('request.headers', true))::json ->> 'x-pet-actor', '')), '');
    if v_hdr is null then return null; end if;
    select s.id into v_id from public.staff s where s.id = v_hdr::uuid and s.salon_id = p_salon;
  exception when others then return null;
  end;
  return v_id;
end;
$$;

create or replace function public.pet_daycare_units(p_plan text, p_start timestamptz, p_end timestamptz) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when p_plan = 'hourly' then greatest(1, ceil(extract(epoch from (p_end - p_start)) / 3600.0)::int) else 1 end
$$;

create or replace function public.pet_daycare_peak(p_salon uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (
    select scheduled_start s,
           case when status in ('checked-in', 'in-daycare', 'ready-for-pickup') then greatest(scheduled_end, now()) else scheduled_end end e
      from public.pet_daycare_visits
     where salon_id = p_salon and (p_exclude is null or id <> p_exclude)
       and status in ('booked', 'checked-in', 'in-daycare', 'ready-for-pickup')
  ), o as (select s, e from v where s < p_end and e > p_start),
  pts as (select p_start t union select s from o where s > p_start and s < p_end)
  select coalesce(max(c), 1)::int from (
    select 1 + (select count(*) from o where o.s <= pts.t and o.e > pts.t) c from pts
  ) x
$$;

create or replace function public.pet_daycare_check_slot(p_salon uuid, p_pet uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cap integer; v_d1 date; v_d2 date;
begin
  perform pg_advisory_xact_lock(hashtextextended('pet_daycare:' || p_salon::text, 0));
  select capacity into v_cap from public.pet_daycare_settings where salon_id = p_salon;
  if v_cap is null then raise exception 'DAYCARE_NOT_CONFIGURED'; end if;
  v_d1 := (p_start at time zone 'Africa/Nairobi')::date;
  v_d2 := (p_end at time zone 'Africa/Nairobi')::date;
  if exists (select 1 from public.pet_boarding_stays s
              where s.pet_id = p_pet and s.salon_id = p_salon and s.status in ('reserved', 'occupied')
                and daterange(s.check_in_on, case when s.check_out_on = s.check_in_on then s.check_in_on + 1 else s.check_out_on end, '[)')
                    && daterange(v_d1, v_d2 + 1, '[)')) then
    raise exception 'PET_BOARDED';
  end if;
  if public.pet_daycare_peak(p_salon, p_start, p_end, p_exclude) > v_cap then raise exception 'DAYCARE_FULL'; end if;
end;
$$;

-- 5. Settings (admin PIN step-up; wrong PIN returns null, never raises).
-- Errors: NOT_AUTHENTICATED, INVALID_SETTINGS, SERVICE_NOT_FOUND, LATE_FEE_NEEDS_HOURLY_RATE.
create or replace function public.pet_daycare_save_settings(
  p_admin_pin text, p_capacity integer, p_full_day_service uuid, p_half_day_service uuid,
  p_hourly_service uuid, p_grace_minutes integer, p_late_fee_enabled boolean
) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_salon uuid := auth_salon_id(); v_sid uuid;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_capacity is null or p_capacity not between 1 and 500 or p_grace_minutes is null or p_grace_minutes not between 0 and 1440 or p_late_fee_enabled is null then
    raise exception 'INVALID_SETTINGS';
  end if;
  foreach v_sid in array array[p_full_day_service, p_half_day_service, p_hourly_service] loop
    if v_sid is not null and not exists (select 1 from public.pet_services s where s.id = v_sid and s.salon_id = v_salon and s.category = 'Daycare' and s.active) then
      raise exception 'SERVICE_NOT_FOUND';
    end if;
  end loop;
  if p_late_fee_enabled and p_hourly_service is null then raise exception 'LATE_FEE_NEEDS_HOURLY_RATE'; end if;
  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then return null; end if;
  insert into public.pet_daycare_settings (salon_id, capacity, full_day_service_id, half_day_service_id, hourly_service_id, overdue_grace_minutes, late_fee_enabled)
  values (v_salon, p_capacity, p_full_day_service, p_half_day_service, p_hourly_service, p_grace_minutes, p_late_fee_enabled)
  on conflict (salon_id) do update set capacity = excluded.capacity, full_day_service_id = excluded.full_day_service_id,
    half_day_service_id = excluded.half_day_service_id, hourly_service_id = excluded.hourly_service_id,
    overdue_grace_minutes = excluded.overdue_grace_minutes, late_fee_enabled = excluded.late_fee_enabled;
  return true;
end;
$$;

-- 6. Visits.
-- Errors: NOT_AUTHENTICATED, INVALID_PLAN, INVALID_TIMES, CUSTOMER_NOT_FOUND, PET_NOT_FOUND, STAFF_NOT_FOUND,
-- DAYCARE_NOT_CONFIGURED, PLAN_NOT_CONFIGURED, SERVICE_NOT_FOUND, DAYCARE_FULL, PET_BOARDED,
-- VISIT_CONFLICT_PET, VISIT_NOT_FOUND, VISIT_NOT_EDITABLE.
create or replace function public.pet_daycare_create_visit(
  p_customer_id uuid, p_pet_id uuid, p_plan text, p_start timestamptz, p_end timestamptz,
  p_staff_id uuid default null, p_instructions text default null, p_notes text default null, p_check_in_now boolean default false
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_salon uuid := auth_salon_id(); v_id uuid; v_actor uuid; v_cfg public.pet_daycare_settings%rowtype;
  v_svc uuid; v_name text; v_price integer; v_now boolean := coalesce(p_check_in_now, false);
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_plan is null or p_plan not in ('full_day', 'half_day', 'hourly') then raise exception 'INVALID_PLAN'; end if;
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > interval '24 hours' or p_end <= now() then
    raise exception 'INVALID_TIMES';
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.salon_id = v_salon) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if not exists (select 1 from public.pet_pets p where p.id = p_pet_id and p.salon_id = v_salon and p.customer_id = p_customer_id) then raise exception 'PET_NOT_FOUND'; end if;
  if p_staff_id is not null and not exists (select 1 from public.staff s where s.id = p_staff_id and s.salon_id = v_salon) then raise exception 'STAFF_NOT_FOUND'; end if;
  select * into v_cfg from public.pet_daycare_settings where salon_id = v_salon;
  if not found or v_cfg.capacity is null then raise exception 'DAYCARE_NOT_CONFIGURED'; end if;
  v_svc := case p_plan when 'full_day' then v_cfg.full_day_service_id when 'half_day' then v_cfg.half_day_service_id else v_cfg.hourly_service_id end;
  if v_svc is null then raise exception 'PLAN_NOT_CONFIGURED'; end if;
  select s.name, s.price into v_name, v_price from public.pet_services s where s.id = v_svc and s.salon_id = v_salon and s.category = 'Daycare' and s.active;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  perform public.pet_daycare_check_slot(v_salon, p_pet_id, p_start, p_end, null);
  v_actor := public.pet_daycare_actor(v_salon);
  insert into public.pet_daycare_visits (salon_id, customer_id, pet_id, plan, service_id, service_name, unit_price, units, scheduled_start, scheduled_end,
      status, assigned_staff_id, customer_instructions, notes, checked_in_at, checked_in_by, created_by)
  values (v_salon, p_customer_id, p_pet_id, p_plan, v_svc, v_name, v_price, public.pet_daycare_units(p_plan, p_start, p_end), p_start, p_end,
      case when v_now then 'checked-in' else 'booked' end, p_staff_id,
      nullif(btrim(coalesce(p_instructions, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
      case when v_now then now() end, case when v_now then v_actor end, v_actor)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then raise exception 'VISIT_CONFLICT_PET';
end;
$$;

-- Booked: times, staff, notes editable. Checked-in / in-daycare / ready: staff, notes, instructions and the
-- end time (start is fixed). Anything else is final.
create or replace function public.pet_daycare_update_visit(
  p_id uuid, p_start timestamptz, p_end timestamptz, p_staff_id uuid, p_instructions text default null, p_notes text default null
) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_salon uuid := auth_salon_id(); v public.pet_daycare_visits%rowtype;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v from public.pet_daycare_visits where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'VISIT_NOT_FOUND'; end if;
  if v.status not in ('booked', 'checked-in', 'in-daycare', 'ready-for-pickup') then raise exception 'VISIT_NOT_EDITABLE'; end if;
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > interval '24 hours' then raise exception 'INVALID_TIMES'; end if;
  if v.status <> 'booked' and p_start <> v.scheduled_start then raise exception 'VISIT_NOT_EDITABLE'; end if;
  if v.status = 'booked' and p_end <= now() then raise exception 'INVALID_TIMES'; end if;
  if p_staff_id is not null and not exists (select 1 from public.staff s where s.id = p_staff_id and s.salon_id = v_salon) then raise exception 'STAFF_NOT_FOUND'; end if;
  if p_start <> v.scheduled_start or p_end <> v.scheduled_end then
    perform public.pet_daycare_check_slot(v_salon, v.pet_id, p_start, p_end, v.id);
  end if;
  update public.pet_daycare_visits
     set scheduled_start = p_start, scheduled_end = p_end, units = public.pet_daycare_units(v.plan, p_start, p_end),
         assigned_staff_id = p_staff_id, customer_instructions = nullif(btrim(coalesce(p_instructions, '')), ''),
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_id and salon_id = v_salon;
exception when exclusion_violation then raise exception 'VISIT_CONFLICT_PET';
end;
$$;

-- Errors: VISIT_NOT_FOUND, INVALID_STATUS_CHANGE, USE_CHECKOUT, NO_SHOW_TOO_EARLY.
create or replace function public.pet_daycare_set_status(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_salon uuid := auth_salon_id(); v public.pet_daycare_visits%rowtype; v_actor uuid;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_status = 'completed' then raise exception 'USE_CHECKOUT'; end if;
  select * into v from public.pet_daycare_visits where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'VISIT_NOT_FOUND'; end if;
  if not ((v.status = 'booked' and p_status in ('checked-in', 'cancelled', 'no-show'))
       or (v.status = 'checked-in' and p_status = 'in-daycare')
       or (v.status = 'in-daycare' and p_status = 'ready-for-pickup')) then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;
  if p_status = 'no-show' and now() < v.scheduled_start then raise exception 'NO_SHOW_TOO_EARLY'; end if;
  v_actor := public.pet_daycare_actor(v_salon);
  update public.pet_daycare_visits
     set status = p_status,
         checked_in_at = case when p_status = 'checked-in' then now() else checked_in_at end,
         checked_in_by = case when p_status = 'checked-in' then v_actor else checked_in_by end,
         ready_at = case when p_status = 'ready-for-pickup' then now() else ready_at end,
         cancelled_at = case when p_status in ('cancelled', 'no-show') then now() else cancelled_at end
   where id = p_id and salon_id = v_salon;
  return p_status;
end;
$$;

-- Errors: VISIT_NOT_FOUND, VISIT_NOT_ACTIVE, INVALID_KIND, INVALID_LOG, INVALID_TIMES.
create or replace function public.pet_daycare_add_log(
  p_visit_id uuid, p_kind text, p_details text default null, p_medication_name text default null,
  p_dose text default null, p_occurred_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_salon uuid := auth_salon_id(); v public.pet_daycare_visits%rowtype; v_id uuid; v_at timestamptz := coalesce(p_occurred_at, now());
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v from public.pet_daycare_visits where id = p_visit_id and salon_id = v_salon;
  if not found then raise exception 'VISIT_NOT_FOUND'; end if;
  if v.status not in ('checked-in', 'in-daycare', 'ready-for-pickup') then raise exception 'VISIT_NOT_ACTIVE'; end if;
  if p_kind is null or p_kind not in ('feeding', 'water', 'play', 'rest', 'toileting', 'medication', 'behaviour', 'incident', 'note') then raise exception 'INVALID_KIND'; end if;
  if v_at < v.checked_in_at or v_at > now() + interval '5 minutes' then raise exception 'INVALID_TIMES'; end if;
  insert into public.pet_daycare_care_logs (salon_id, visit_id, kind, details, medication_name, dose, occurred_at, recorded_by)
  values (v_salon, p_visit_id, p_kind, nullif(btrim(coalesce(p_details, '')), ''), nullif(btrim(coalesce(p_medication_name, '')), ''),
          nullif(btrim(coalesce(p_dose, '')), ''), v_at, public.pet_daycare_actor(v_salon))
  returning id into v_id;
  return v_id;
exception when check_violation then raise exception 'INVALID_LOG';
end;
$$;

-- 7. Billing preview and checkout.
create or replace function public.pet_daycare_billing(p_visit_id uuid)
returns table (
  status text, plan text, service_name text, unit_price integer, units integer, base_total bigint,
  late_fee_enabled boolean, late_hours integer, late_unit_price integer, late_total bigint, total bigint,
  scheduled_end timestamptz, collected_at timestamptz, grace_minutes integer, minutes_overdue integer,
  invoice_id uuid, invoice_number text
)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v_salon uuid := auth_salon_id(); v public.pet_daycare_visits%rowtype; c public.pet_daycare_settings%rowtype;
  v_ref timestamptz; v_over integer; v_late integer := 0; v_lp integer := 0;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v from public.pet_daycare_visits where id = p_visit_id and salon_id = v_salon;
  if not found then raise exception 'VISIT_NOT_FOUND'; end if;
  select * into c from public.pet_daycare_settings where salon_id = v_salon;
  v_ref := coalesce(v.collected_at, now());
  v_over := greatest(0, floor(extract(epoch from (v_ref - v.scheduled_end)) / 60)::int);
  if coalesce(c.late_fee_enabled, false) and c.hourly_service_id is not null then
    select s.price into v_lp from public.pet_services s where s.id = c.hourly_service_id and s.salon_id = v_salon;
    v_lp := coalesce(v_lp, 0);
    v_late := least(24, ceil(greatest(0, v_over - c.overdue_grace_minutes) / 60.0)::int);
  end if;
  return query
    select v.status::text, v.plan::text, v.service_name::text, v.unit_price, v.units, v.units::bigint * v.unit_price,
           coalesce(c.late_fee_enabled, false), v_late, v_lp, v_late::bigint * v_lp,
           v.units::bigint * v.unit_price + v_late::bigint * v_lp,
           v.scheduled_end, v.collected_at, coalesce(c.overdue_grace_minutes, 0), v_over, i.id, i.invoice_number::text
      from (select 1) x
      left join public.pet_invoices i on i.salon_id = v_salon and i.daycare_visit_id = p_visit_id and i.status <> 'void';
end;
$$;

-- Completes the visit (ready-for-pickup -> completed) AND creates its invoice atomically. A completed visit whose
-- invoice was voided can be billed again (no new status change). A zero total completes without an invoice (null).
-- Errors: NOT_AUTHENTICATED, INVALID_KEY, VISIT_NOT_FOUND, VISIT_NOT_READY, VISIT_ALREADY_INVOICED,
-- VISIT_SERVICE_MISSING, INVALID_LATE_HOURS, INVALID_DISCOUNT, SETTINGS_MISSING.
create or replace function public.pet_daycare_checkout(
  p_idempotency_key uuid, p_visit_id uuid, p_late_hours integer default null, p_discount_type text default 'amount',
  p_discount_value numeric default 0, p_due_date date default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_salon uuid := auth_salon_id(); v public.pet_daycare_visits%rowtype; c public.pet_daycare_settings%rowtype;
  v_existing uuid; v_id uuid; v_ref timestamptz := now(); v_over integer; v_max integer := 0; v_late integer; v_lp integer := 0;
  v_late_svc uuid; v_subtotal bigint; v_discount bigint := 0; v_total bigint; v_tax_enabled boolean := false;
  v_tax_rate integer := 0; v_tax_amount bigint := 0; v_next integer; v_number text; v_note text; v_constraint text;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_KEY'; end if;
  select id into v_existing from public.pet_invoices where salon_id = v_salon and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  select * into v from public.pet_daycare_visits where id = p_visit_id and salon_id = v_salon for update;
  if not found then raise exception 'VISIT_NOT_FOUND'; end if;
  if v.status not in ('ready-for-pickup', 'completed') then raise exception 'VISIT_NOT_READY'; end if;
  if exists (select 1 from public.pet_invoices where salon_id = v_salon and daycare_visit_id = p_visit_id and status <> 'void') then
    raise exception 'VISIT_ALREADY_INVOICED';
  end if;
  if v.status = 'completed' then v_ref := v.collected_at; end if;
  if v.service_id is null then raise exception 'VISIT_SERVICE_MISSING'; end if;

  select * into c from public.pet_daycare_settings where salon_id = v_salon;
  v_over := greatest(0, floor(extract(epoch from (v_ref - v.scheduled_end)) / 60)::int);
  if coalesce(c.late_fee_enabled, false) and c.hourly_service_id is not null then
    select s.price into v_lp from public.pet_services s where s.id = c.hourly_service_id and s.salon_id = v_salon;
    v_lp := coalesce(v_lp, 0); v_late_svc := c.hourly_service_id;
    v_max := least(24, ceil(greatest(0, v_over - c.overdue_grace_minutes) / 60.0)::int);
  end if;
  v_late := coalesce(p_late_hours, v_max);
  if v_late < 0 or v_late > v_max then raise exception 'INVALID_LATE_HOURS'; end if;
  if v_lp = 0 then v_late := 0; end if;

  v_subtotal := v.units::bigint * v.unit_price + v_late::bigint * v_lp;
  if p_discount_type = 'percent' then
    if p_discount_value is null or p_discount_value < 0 or p_discount_value > 100 then raise exception 'INVALID_DISCOUNT'; end if;
    v_discount := round(v_subtotal * p_discount_value / 100.0);
  elsif p_discount_type = 'amount' then
    if p_discount_value is null or p_discount_value < 0 or p_discount_value <> trunc(p_discount_value) or p_discount_value > v_subtotal then raise exception 'INVALID_DISCOUNT'; end if;
    v_discount := p_discount_value;
  else raise exception 'INVALID_DISCOUNT';
  end if;
  v_total := v_subtotal - v_discount;

  if v.status = 'ready-for-pickup' then
    update public.pet_daycare_visits set status = 'completed', collected_at = now(), collected_by = public.pet_daycare_actor(v_salon)
     where id = p_visit_id and salon_id = v_salon;
  end if;
  if v_total = 0 then return null; end if;

  select ss.tax_enabled, ss.tax_rate, ss.next_invoice_number into v_tax_enabled, v_tax_rate, v_next
    from public.salon_settings ss where ss.salon_id = v_salon for update;
  if not found then raise exception 'SETTINGS_MISSING'; end if;
  if v_tax_enabled then v_tax_amount := v_total - round(v_total / (1 + v_tax_rate / 100.0)); else v_tax_rate := 0; end if;
  v_number := 'INV-' || lpad(v_next::text, 4, '0');
  update public.salon_settings set next_invoice_number = v_next + 1 where salon_id = v_salon;

  v_note := 'Daycare ' || to_char(v.scheduled_start at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') || ' to '
            || to_char(v.scheduled_end at time zone 'Africa/Nairobi', 'HH24:MI')
            || case when v_late > 0 then ', ' || v_late || ' late hour(s)' else '' end
            || case when v_late < v_max then ' (late charge reduced from ' || v_max || ' hour(s))' else '' end
            || coalesce(E'\n' || nullif(btrim(coalesce(p_notes, '')), ''), '');

  insert into public.pet_invoices (salon_id, customer_id, pet_id, booking_id, daycare_visit_id, invoice_number, idempotency_key, status,
      subtotal, discount_amount, total, tax_enabled, tax_rate, tax_amount, amount_paid, due_date, notes)
  values (v_salon, v.customer_id, v.pet_id, null, p_visit_id, v_number, p_idempotency_key, 'issued',
      v_subtotal, v_discount, v_total, v_tax_enabled, v_tax_rate, v_tax_amount, 0, p_due_date, v_note)
  returning id into v_id;
  if v.units * v.unit_price > 0 then
    insert into public.pet_invoice_lines (salon_id, invoice_id, service_id, description, quantity, unit_price, line_total)
    values (v_salon, v_id, v.service_id, v.service_name, v.units, v.unit_price, v.units * v.unit_price);
  end if;
  if v_late > 0 then
    insert into public.pet_invoice_lines (salon_id, invoice_id, service_id, description, quantity, unit_price, line_total)
    values (v_salon, v_id, v_late_svc, 'Daycare - late pickup (per hour)', v_late, v_lp, v_late * v_lp);
  end if;
  return v_id;
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'pet_invoices_idempotency_uidx' then
    select id into v_existing from public.pet_invoices where salon_id = v_salon and idempotency_key = p_idempotency_key;
    if found then return v_existing; end if;
  end if;
  if v_constraint = 'pet_invoices_daycare_live_uidx' then raise exception 'VISIT_ALREADY_INVOICED'; end if;
  raise;
end;
$$;

-- 8. Grants: default privileges expose new functions to anon/authenticated, so revoke then grant narrowly.
revoke execute on function public.pet_daycare_actor(uuid), public.pet_daycare_units(text, timestamptz, timestamptz),
  public.pet_daycare_peak(uuid, timestamptz, timestamptz, uuid), public.pet_daycare_check_slot(uuid, uuid, timestamptz, timestamptz, uuid),
  public.pet_daycare_logs_immutable() from public, anon, authenticated;
revoke execute on function public.pet_daycare_save_settings(text, integer, uuid, uuid, uuid, integer, boolean),
  public.pet_daycare_create_visit(uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, boolean),
  public.pet_daycare_update_visit(uuid, timestamptz, timestamptz, uuid, text, text),
  public.pet_daycare_set_status(uuid, text),
  public.pet_daycare_add_log(uuid, text, text, text, text, timestamptz),
  public.pet_daycare_billing(uuid),
  public.pet_daycare_checkout(uuid, uuid, integer, text, numeric, date, text) from public, anon;
grant execute on function public.pet_daycare_save_settings(text, integer, uuid, uuid, uuid, integer, boolean),
  public.pet_daycare_create_visit(uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, boolean),
  public.pet_daycare_update_visit(uuid, timestamptz, timestamptz, uuid, text, text),
  public.pet_daycare_set_status(uuid, text),
  public.pet_daycare_add_log(uuid, text, text, text, text, timestamptz),
  public.pet_daycare_billing(uuid),
  public.pet_daycare_checkout(uuid, uuid, integer, text, numeric, date, text) to authenticated;
