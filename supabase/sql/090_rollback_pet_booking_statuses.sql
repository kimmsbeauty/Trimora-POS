-- supabase/sql/090_rollback_pet_booking_statuses.sql
--
-- MANUAL recovery script for migration 090 (not a migration; never applied automatically).
-- Restores the 088 booking statuses: pending / confirmed / checked-in / in-progress /
-- completed / cancelled / no-show. Run it ONLY together with rolling the application back to
-- the release that speaks the 088 statuses, and only if 090 has to be undone.
--
-- Lossy mappings (no rows are deleted): booked -> confirmed, ready -> in-progress.
-- One transaction: if any step fails, nothing is changed.

begin;

alter table public.pet_bookings drop constraint pet_bookings_status_check;
update public.pet_bookings set status = 'confirmed' where status = 'booked';
update public.pet_bookings set status = 'in-progress' where status = 'ready';
alter table public.pet_bookings add constraint pet_bookings_status_check
  check (status in ('pending', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'));
alter table public.pet_bookings alter column status set default 'confirmed';

-- The three function bodies below are copied verbatim from 088_pet_bookings.sql.
create or replace function public.pet_create_booking(
  p_customer_id uuid,
  p_pet_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_service_ids uuid[],
  p_walk_in boolean default false,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_id uuid;
  v_ids uuid[];
  v_constraint text;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
     or p_ends_at - p_starts_at > interval '24 hours' then
    raise exception 'INVALID_TIME_RANGE';
  end if;
  select array_agg(distinct x) into v_ids from unnest(p_service_ids) as x;
  if v_ids is null or cardinality(v_ids) = 0 then raise exception 'NO_SERVICES'; end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.salon_id = v_salon) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if not exists (select 1 from public.pet_pets p
                 where p.id = p_pet_id and p.salon_id = v_salon and p.customer_id = p_customer_id) then
    raise exception 'PET_NOT_FOUND';
  end if;
  if p_staff_id is not null and not exists (
       select 1 from public.staff s where s.id = p_staff_id and s.salon_id = v_salon and coalesce(s.active, true)) then
    raise exception 'STAFF_NOT_FOUND';
  end if;
  if (select count(*) from public.pet_services s
      where s.id = any (v_ids) and s.salon_id = v_salon and s.active) <> cardinality(v_ids) then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  insert into public.pet_bookings (salon_id, customer_id, pet_id, staff_id, starts_at, ends_at, status, walk_in, notes)
  values (v_salon, p_customer_id, p_pet_id, p_staff_id, p_starts_at, p_ends_at,
          case when coalesce(p_walk_in, false) then 'checked-in' else 'confirmed' end,
          coalesce(p_walk_in, false), nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  insert into public.pet_booking_services (salon_id, booking_id, service_id, service_name, price, duration_minutes)
  select v_salon, v_id, s.id, s.name, s.price, s.duration_minutes
  from public.pet_services s where s.id = any (v_ids);

  return v_id;
exception
  when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pet_bookings_no_staff_overlap' then
      raise exception 'BOOKING_CONFLICT_STAFF';
    end if;
    raise exception 'BOOKING_CONFLICT_PET';
end;
$$;

-- ---------------------------------------------------------------------------
-- pet_update_booking: reschedule / reassign / edit notes. Only while the booking
-- is pending, confirmed or checked-in. Passing p_staff_id = null unassigns.
-- Extra errors: BOOKING_NOT_FOUND, BOOKING_NOT_EDITABLE.
-- ---------------------------------------------------------------------------
create or replace function public.pet_update_booking(
  p_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_status text;
  v_constraint text;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select status into v_status from public.pet_bookings where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_status not in ('pending', 'confirmed', 'checked-in') then raise exception 'BOOKING_NOT_EDITABLE'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
     or p_ends_at - p_starts_at > interval '24 hours' then
    raise exception 'INVALID_TIME_RANGE';
  end if;
  if p_staff_id is not null and not exists (
       select 1 from public.staff s where s.id = p_staff_id and s.salon_id = v_salon and coalesce(s.active, true)) then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  update public.pet_bookings
     set staff_id = p_staff_id, starts_at = p_starts_at, ends_at = p_ends_at,
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_id and salon_id = v_salon;
exception
  when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pet_bookings_no_staff_overlap' then
      raise exception 'BOOKING_CONFLICT_STAFF';
    end if;
    raise exception 'BOOKING_CONFLICT_PET';
end;
$$;

-- ---------------------------------------------------------------------------
-- pet_set_booking_status: moves a booking along the allowed path (see header).
-- Extra errors: BOOKING_NOT_FOUND, INVALID_STATUS_CHANGE.
-- ---------------------------------------------------------------------------
create or replace function public.pet_set_booking_status(p_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_status text;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select status into v_status from public.pet_bookings where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not (
       (v_status = 'pending'     and p_status in ('confirmed', 'checked-in', 'cancelled'))
    or (v_status = 'confirmed'   and p_status in ('checked-in', 'cancelled', 'no-show'))
    or (v_status = 'checked-in'  and p_status in ('in-progress', 'cancelled'))
    or (v_status = 'in-progress' and p_status = 'completed')
  ) then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;
  update public.pet_bookings set status = p_status where id = p_id and salon_id = v_salon;
  return p_status;
end;
$$;

-- CREATE OR REPLACE keeps the existing grants; they are restated so this migration is
-- self-contained (anon out, signed-in devices in).
revoke execute on function public.pet_create_booking(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text) from public, anon;
revoke execute on function public.pet_update_booking(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.pet_set_booking_status(uuid, text) from public, anon;
grant execute on function public.pet_create_booking(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text) to authenticated;
grant execute on function public.pet_update_booking(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.pet_set_booking_status(uuid, text) to authenticated;

commit;
