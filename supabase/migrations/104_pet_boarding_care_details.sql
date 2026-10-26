-- 104_pet_boarding_care_details.sql
--
-- Trimora Pet -- boarding: a per-stay emergency contact and medication instructions.
--
-- STATUS: applied to production 2026-10-25 on the owner's instruction (history name
-- `pet_boarding_care_details`); see the migrations README for the verification.
--
-- WHY: a pet can be left with a different contact than the one on the customer
-- profile (the owner is travelling), and boarding staff need to know what medicine to
-- give and when. Until now there was only free-text feeding and care notes.
--
-- WHAT IT DOES (additive columns; two functions replaced):
--   1. pet_boarding_stays.emergency_contact_name / emergency_contact_phone /
--      medication_notes (all optional). The contact must have BOTH name and phone or
--      neither (INVALID_CONTACT); notes are at most 500 characters (INVALID_NOTES).
--   2. pet_create_stay and pet_update_stay gain three trailing parameters. The old
--      signatures are dropped so there is no ambiguous overload. In pet_update_stay a
--      NULL parameter means "leave unchanged" and an empty string clears the value, so a
--      stale browser tab running the old screen cannot wipe medication notes.
--
-- VISIBILITY: same as the existing feeding and care notes: anyone who can open the
-- Boarding screen. Medication instructions are operational care instructions, not a
-- medical record. Allergies and medical history on the pet profile are still NOT stored
-- (083): that waits for enforced permissions.
--
-- NOT covered: charging for late collection or early departure (stays are not invoiced
-- yet), and other rate models.
--
-- ROLLBACK (loses only the three new columns' contents; restores the 089 functions by
-- re-running those two definitions from 089_pet_boarding.sql):
--   drop function if exists public.pet_update_stay(uuid, uuid, date, date, text, text, text, text, text);
--   drop function if exists public.pet_create_stay(uuid, uuid, uuid, date, date, uuid, text, text, boolean, text, text, text);
--   alter table public.pet_boarding_stays drop column if exists medication_notes;
--   alter table public.pet_boarding_stays drop column if exists emergency_contact_phone;
--   alter table public.pet_boarding_stays drop column if exists emergency_contact_name;
--   -- then re-create pet_create_stay and pet_update_stay exactly as in 089 (and its grants).

alter table public.pet_boarding_stays
  add column if not exists emergency_contact_name text check (emergency_contact_name is null or char_length(emergency_contact_name) <= 80),
  add column if not exists emergency_contact_phone text check (emergency_contact_phone is null or emergency_contact_phone ~ '^[0-9+() -]{6,30}$'),
  add column if not exists medication_notes text check (medication_notes is null or char_length(medication_notes) <= 500);

drop function if exists public.pet_create_stay(uuid, uuid, uuid, date, date, uuid, text, text, boolean);
drop function if exists public.pet_update_stay(uuid, uuid, date, date, text, text);

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

create or replace function public.pet_update_stay(
  p_id uuid,
  p_kennel_id uuid,
  p_check_in date,
  p_check_out date,
  p_feeding text default null,
  p_notes text default null,
  p_emergency_name text default null,
  p_emergency_phone text default null,
  p_medication text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_s public.pet_boarding_stays%rowtype;
  v_maint boolean;
  v_constraint text;
  v_ename text;
  v_ephone text;
  v_med text;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_s from public.pet_boarding_stays where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'STAY_NOT_FOUND'; end if;
  if v_s.status not in ('reserved', 'occupied') then raise exception 'STAY_NOT_EDITABLE'; end if;
  if p_check_in is null or p_check_out is null or p_check_out < p_check_in or p_check_out - p_check_in > 365 then
    raise exception 'INVALID_DATES';
  end if;
  if v_s.status = 'occupied' and p_check_in <> v_s.check_in_on then
    raise exception 'STAY_CHECKIN_LOCKED';
  end if;
  -- NULL = leave unchanged (so an old screen that doesn't send these can never wipe them);
  -- an empty string clears the value.
  v_ename := case when p_emergency_name is null then v_s.emergency_contact_name else nullif(btrim(p_emergency_name), '') end;
  v_ephone := case when p_emergency_phone is null then v_s.emergency_contact_phone else nullif(btrim(p_emergency_phone), '') end;
  v_med := case when p_medication is null then v_s.medication_notes else nullif(btrim(p_medication), '') end;
  if (v_ename is null) <> (v_ephone is null)
     or (v_ename is not null and (char_length(v_ename) > 80 or v_ephone !~ '^[0-9+() -]{6,30}$')) then
    raise exception 'INVALID_CONTACT';
  end if;
  if v_med is not null and char_length(v_med) > 500 then raise exception 'INVALID_NOTES'; end if;
  select k.maintenance into v_maint from public.pet_kennels k where k.id = p_kennel_id and k.salon_id = v_salon;
  if not found then raise exception 'KENNEL_NOT_FOUND'; end if;
  if v_maint and p_kennel_id <> v_s.kennel_id then raise exception 'KENNEL_MAINTENANCE'; end if;

  update public.pet_boarding_stays
     set kennel_id = p_kennel_id,
         check_in_on = p_check_in,
         check_out_on = p_check_out,
         feeding_notes = nullif(btrim(coalesce(p_feeding, '')), ''),
         care_notes = nullif(btrim(coalesce(p_notes, '')), ''),
         emergency_contact_name = v_ename,
         emergency_contact_phone = v_ephone,
         medication_notes = v_med
   where id = p_id and salon_id = v_salon;
exception
  when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pet_stays_no_kennel_overlap' then
      raise exception 'STAY_CONFLICT_KENNEL';
    end if;
    raise exception 'STAY_CONFLICT_PET';
end;
$$;

revoke execute on function public.pet_create_stay(uuid, uuid, uuid, date, date, uuid, text, text, boolean, text, text, text) from public, anon;
revoke execute on function public.pet_update_stay(uuid, uuid, date, date, text, text, text, text, text) from public, anon;
grant execute on function public.pet_create_stay(uuid, uuid, uuid, date, date, uuid, text, text, boolean, text, text, text) to authenticated;
grant execute on function public.pet_update_stay(uuid, uuid, date, date, text, text, text, text, text) to authenticated;
