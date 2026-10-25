-- 097_rollback_pet_archive.sql  -- MANUAL script, never applied automatically.
-- Undoes 097. Refuses to run while any pet is archived, so archive information is
-- never lost silently: restore (unarchive) those pets first, or accept the loss by
-- editing the guard below.
do $$
begin
  if exists (select 1 from public.pet_pets where archived_at is not null) then
    raise exception 'Some pets are archived. Restore them first (pet_set_archived(id, false)) before rolling back 097.';
  end if;
end $$;

-- Restore the 089 / 092 function bodies exactly.
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
          case when coalesce(p_walk_in, false) then 'checked-in' else 'booked' end,
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

create or replace function public.pet_create_stay(
  p_customer_id uuid,
  p_pet_id uuid,
  p_kennel_id uuid,
  p_check_in date,
  p_check_out date,
  p_service_id uuid default null,
  p_feeding text default null,
  p_notes text default null,
  p_check_in_now boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_id uuid;
  v_name text;
  v_rate integer;
  v_maint boolean;
  v_constraint text;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_check_in is null or p_check_out is null or p_check_out < p_check_in or p_check_out - p_check_in > 365 then
    raise exception 'INVALID_DATES';
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.salon_id = v_salon) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if not exists (select 1 from public.pet_pets p
                  where p.id = p_pet_id and p.salon_id = v_salon and p.customer_id = p_customer_id) then
    raise exception 'PET_NOT_FOUND';
  end if;
  select k.maintenance into v_maint from public.pet_kennels k where k.id = p_kennel_id and k.salon_id = v_salon;
  if not found then raise exception 'KENNEL_NOT_FOUND'; end if;
  if v_maint then raise exception 'KENNEL_MAINTENANCE'; end if;
  if p_service_id is not null then
    select s.name, s.price into v_name, v_rate
      from public.pet_services s
     where s.id = p_service_id and s.salon_id = v_salon and s.active and s.category = 'Boarding';
    if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  end if;

  insert into public.pet_boarding_stays
    (salon_id, customer_id, pet_id, kennel_id, check_in_on, check_out_on, status,
     service_id, service_name, nightly_rate, feeding_notes, care_notes, checked_in_at)
  values
    (v_salon, p_customer_id, p_pet_id, p_kennel_id, p_check_in, p_check_out,
     case when coalesce(p_check_in_now, false) then 'occupied' else 'reserved' end,
     p_service_id, v_name, v_rate,
     nullif(btrim(coalesce(p_feeding, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
     case when coalesce(p_check_in_now, false) then now() else null end)
  returning id into v_id;
  return v_id;
exception
  when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pet_stays_no_kennel_overlap' then
      raise exception 'STAY_CONFLICT_KENNEL';
    end if;
    raise exception 'STAY_CONFLICT_PET';
end;
$$;

drop trigger if exists pet_pets_guard_archive on public.pet_pets;
drop function if exists public.pet_pets_guard_archive();
drop function if exists public.pet_set_archived(uuid, boolean, text);
drop index if exists public.pet_pets_active_idx;
alter table public.pet_pets drop constraint if exists pet_pets_archive_consistent;
alter table public.pet_pets drop column if exists archived_reason, drop column if exists archived_at;
