-- 105_pet_species_guard.sql
--
-- Trimora Pet -- enforce "this service is not offered for this species" in the database.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply by hand in the Supabase
-- SQL Editor only after the owner says "apply 105".
--
-- WHY: the booking and boarding forms already refuse a service whose species list excludes the
-- pet, but the rule lived only in the browser. Anything calling the functions directly (a stale
-- tab, another client) could still book a Cat into a Dogs-only service. This moves the same rule
-- into the two creating functions. Rule (identical to the form): a service with an empty species
-- list is offered for every species; otherwise the pet's species must be in the list.
--
-- WHAT IT DOES: nothing else. No table, column, policy, grant or index is touched. Exactly two
-- functions are replaced, with unchanged signatures (so existing grants are kept):
--   1. pet_create_booking(...)  = the live 092 definition + the species check
--   2. pet_create_stay(...)     = the live 104 definition (emergency contact, medication) + the species check
-- Both raise SERVICE_SPECIES_MISMATCH. The pet's species is read in the same statement that already
-- checks the pet belongs to this business and customer, so PET_NOT_FOUND behaves exactly as before.
-- Updating an existing booking or stay never changes its services, so those functions need no change.
-- (The archived-pet refusal already exists as triggers from 097; it is not repeated here.)
--
-- ORDER: safe in either order with the app. The screens already check species first, so they never
-- send a mismatch; before 105 the database simply doesn't re-check. The app maps the new error to a
-- plain sentence.
--
-- ROLLBACK: supabase/sql/105_rollback_pet_species_guard.sql restores the 092 and 104 definitions exactly.

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
  select p.species into v_species from public.pet_pets p
   where p.id = p_pet_id and p.salon_id = v_salon and p.customer_id = p_customer_id;
  if not found then
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
  -- NEW in 105: a service with a species list is only for those species (empty list = all species).
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

create or replace function public.pet_create_stay(
  p_customer_id uuid,
  p_pet_id uuid,
  p_kennel_id uuid,
  p_check_in date,
  p_check_out date,
  p_service_id uuid default null,
  p_feeding text default null,
  p_notes text default null,
  p_check_in_now boolean default false,
  p_emergency_name text default null,
  p_emergency_phone text default null,
  p_medication text default null
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
  v_ename text := nullif(btrim(coalesce(p_emergency_name, '')), '');
  v_ephone text := nullif(btrim(coalesce(p_emergency_phone, '')), '');
  v_med text := nullif(btrim(coalesce(p_medication, '')), '');
  v_species text;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_check_in is null or p_check_out is null or p_check_out < p_check_in or p_check_out - p_check_in > 365 then
    raise exception 'INVALID_DATES';
  end if;
  if (v_ename is null) <> (v_ephone is null)
     or (v_ename is not null and (char_length(v_ename) > 80 or v_ephone !~ '^[0-9+() -]{6,30}$')) then
    raise exception 'INVALID_CONTACT';
  end if;
  if v_med is not null and char_length(v_med) > 500 then raise exception 'INVALID_NOTES'; end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.salon_id = v_salon) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  select p.species into v_species from public.pet_pets p
   where p.id = p_pet_id and p.salon_id = v_salon and p.customer_id = p_customer_id;
  if not found then
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
    -- NEW in 105: a service with a species list is only for those species (empty list = all species).
    if exists (select 1 from public.pet_services s
                where s.id = p_service_id and cardinality(s.species) > 0 and not (v_species = any (s.species))) then
      raise exception 'SERVICE_SPECIES_MISMATCH';
    end if;
  end if;

  insert into public.pet_boarding_stays
    (salon_id, customer_id, pet_id, kennel_id, check_in_on, check_out_on, status,
     service_id, service_name, nightly_rate, feeding_notes, care_notes, checked_in_at,
     emergency_contact_name, emergency_contact_phone, medication_notes)
  values
    (v_salon, p_customer_id, p_pet_id, p_kennel_id, p_check_in, p_check_out,
     case when coalesce(p_check_in_now, false) then 'occupied' else 'reserved' end,
     p_service_id, v_name, v_rate,
     nullif(btrim(coalesce(p_feeding, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
     case when coalesce(p_check_in_now, false) then now() else null end,
     v_ename, v_ephone, v_med)
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
