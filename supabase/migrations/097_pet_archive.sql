-- 097_pet_archive.sql   (number is PROVISIONAL: 096 is held, check every branch before applying)
--
-- Trimora Pet -- archive pets (restorable), and database-level guards so an
-- archived pet cannot be booked/boarded and a service restricted to certain
-- species cannot be booked for another species.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 097" (after seeing this SQL, the rollback and the test results).
--
-- WHAT IT DOES
--  1. pet_pets gets archived_at + archived_reason (passed-away / moved-away /
--     inactive / other). Nothing is deleted: bookings, stays, invoices, payments,
--     vaccinations and the audit trail keep pointing at the pet.
--  2. pet_set_archived(p_id, p_archived, p_reason): the ONLY way to archive or
--     restore (a trigger refuses direct writes to the two columns). Tenant-checked,
--     idempotent. Archiving is refused while the pet still has an open booking
--     (booked / checked-in / in-progress / ready) or an open stay (reserved /
--     occupied), so nothing live is orphaned: PET_HAS_OPEN_BOOKINGS, PET_HAS_OPEN_STAY.
--  3. pet_create_booking and pet_create_stay (copies of the live 092 / 089
--     definitions plus the new checks only): PET_ARCHIVED, SERVICE_SPECIES_MISMATCH.
--  4. Species VALUES are already restricted by pet_pets_species_check
--     (Dog, Cat, Rabbit, Other) and are not changed here.
--
-- EXISTING DATA: before applying, run supabase/sql/097_preflight_checks.sql
-- (read-only). Production had 0 pet rows when this was written.
--
-- ROLLBACK: supabase/sql/097_rollback_pet_archive.sql (restores the 092 / 089
-- function bodies, drops the trigger and function; refuses if any pet is archived
-- unless you restore them first, so no archive information is lost silently).

alter table public.pet_pets
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

alter table public.pet_pets
  add constraint pet_pets_archive_consistent check (
    (archived_at is null and archived_reason is null)
    or (archived_at is not null and archived_reason in ('passed-away', 'moved-away', 'inactive', 'other'))
  );

create index if not exists pet_pets_active_idx on public.pet_pets (salon_id) where archived_at is null;

-- Direct writes to the archive columns are refused; pet_set_archived() sets a
-- transaction-local flag that lets its own update through.
create or replace function public.pet_pets_guard_archive()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.archived_at is not null or new.archived_reason is not null then
      raise exception 'ARCHIVE_VIA_FUNCTION_ONLY';
    end if;
  elsif (new.archived_at is distinct from old.archived_at or new.archived_reason is distinct from old.archived_reason)
        and coalesce(current_setting('pet.archive_rpc', true), '') <> 'on' then
    raise exception 'ARCHIVE_VIA_FUNCTION_ONLY';
  end if;
  return new;
end;
$$;

create trigger pet_pets_guard_archive
  before insert or update on public.pet_pets
  for each row execute function public.pet_pets_guard_archive();

create or replace function public.pet_set_archived(
  p_id uuid,
  p_archived boolean,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_current timestamptz;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select p.archived_at into v_current from public.pet_pets p where p.id = p_id and p.salon_id = v_salon for update;
  if not found then raise exception 'PET_NOT_FOUND'; end if;

  if coalesce(p_archived, false) then
    if p_reason is null or p_reason not in ('passed-away', 'moved-away', 'inactive', 'other') then
      raise exception 'INVALID_ARCHIVE_REASON';
    end if;
    if v_current is not null then return; end if;  -- already archived: nothing to do
    if exists (select 1 from public.pet_bookings b
                where b.pet_id = p_id and b.salon_id = v_salon
                  and b.status in ('booked', 'checked-in', 'in-progress', 'ready')) then
      raise exception 'PET_HAS_OPEN_BOOKINGS';
    end if;
    if exists (select 1 from public.pet_boarding_stays s
                where s.pet_id = p_id and s.salon_id = v_salon and s.status in ('reserved', 'occupied')) then
      raise exception 'PET_HAS_OPEN_STAY';
    end if;
    perform set_config('pet.archive_rpc', 'on', true);
    update public.pet_pets set archived_at = now(), archived_reason = p_reason where id = p_id;
  else
    if v_current is null then return; end if;      -- already active
    perform set_config('pet.archive_rpc', 'on', true);
    update public.pet_pets set archived_at = null, archived_reason = null where id = p_id;
  end if;
  perform set_config('pet.archive_rpc', 'off', true);
end;
$$;

revoke execute on function public.pet_set_archived(uuid, boolean, text) from public, anon;
grant execute on function public.pet_set_archived(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- pet_create_booking: the live 092 definition + PET_ARCHIVED + SERVICE_SPECIES_MISMATCH.
-- (create or replace keeps the existing grants.)
-- ---------------------------------------------------------------------------
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
  v_species text;
  v_archived timestamptz;
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
  select p.species, p.archived_at into v_species, v_archived
    from public.pet_pets p
   where p.id = p_pet_id and p.salon_id = v_salon and p.customer_id = p_customer_id;
  if not found then raise exception 'PET_NOT_FOUND'; end if;
  if v_archived is not null then raise exception 'PET_ARCHIVED'; end if;
  if p_staff_id is not null and not exists (
       select 1 from public.staff s where s.id = p_staff_id and s.salon_id = v_salon and coalesce(s.active, true)) then
    raise exception 'STAFF_NOT_FOUND';
  end if;
  if (select count(*) from public.pet_services s
      where s.id = any (v_ids) and s.salon_id = v_salon and s.active) <> cardinality(v_ids) then
    raise exception 'SERVICE_NOT_FOUND';
  end if;
  -- A service with a species list is only for those species (empty list = all species).
  if exists (select 1 from public.pet_services s
              where s.id = any (v_ids) and s.salon_id = v_salon
                and cardinality(s.species) > 0 and not (v_species = any (s.species))) then
    raise exception 'SERVICE_SPECIES_MISMATCH';
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

-- ---------------------------------------------------------------------------
-- pet_create_stay: the live 089 definition + PET_ARCHIVED + SERVICE_SPECIES_MISMATCH.
-- ---------------------------------------------------------------------------
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
  v_species text;
  v_archived timestamptz;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_check_in is null or p_check_out is null or p_check_out < p_check_in or p_check_out - p_check_in > 365 then
    raise exception 'INVALID_DATES';
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.salon_id = v_salon) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  select p.species, p.archived_at into v_species, v_archived
    from public.pet_pets p
   where p.id = p_pet_id and p.salon_id = v_salon and p.customer_id = p_customer_id;
  if not found then raise exception 'PET_NOT_FOUND'; end if;
  if v_archived is not null then raise exception 'PET_ARCHIVED'; end if;
  select k.maintenance into v_maint from public.pet_kennels k where k.id = p_kennel_id and k.salon_id = v_salon;
  if not found then raise exception 'KENNEL_NOT_FOUND'; end if;
  if v_maint then raise exception 'KENNEL_MAINTENANCE'; end if;
  if p_service_id is not null then
    select s.name, s.price into v_name, v_rate
      from public.pet_services s
     where s.id = p_service_id and s.salon_id = v_salon and s.active and s.category = 'Boarding';
    if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
    if exists (select 1 from public.pet_services s
                where s.id = p_service_id and cardinality(s.species) > 0 and not (v_species = any (s.species))) then
      raise exception 'SERVICE_SPECIES_MISMATCH';
    end if;
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
