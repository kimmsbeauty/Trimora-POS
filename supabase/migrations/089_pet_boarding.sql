-- 089_pet_boarding.sql
--
-- Trimora Pet -- Phase 7: boarding (kennels, stays, check-in / check-out) with
-- database-level conflict prevention.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 089".
--
-- ADDITIVE ONLY: two tables and six functions. Requires btree_gist, which 088
-- already installed (re-declared with IF NOT EXISTS, so safe either way).
-- Nothing existing is altered; Salon and Auto are untouched.
--
-- TABLES
--   pet_kennels         a kennel / suite / condo the business owns: name (unique
--                       per business, case-insensitive), kind (free text such as
--                       "Standard", "Deluxe suite", "Feline"), a manual
--                       `maintenance` flag and notes.
--   pet_boarding_stays  one stay: customer, pet, kennel, planned check-in and
--                       check-out DATES, status, feeding and care notes, and
--                       optionally the boarding service chosen. The service name
--                       and nightly rate are COPIED at booking time, so later
--                       catalogue edits never rewrite a stay (invoicing, a later
--                       phase, builds on these).
--
-- STATUSES
--   stay:   reserved -> occupied (checked in) -> checked-out; reserved or occupied
--           can be cancelled (only while reserved). checked-out and cancelled are final.
--   kennel: occupied | reserved | available | maintenance (the Lovable KennelStatus
--           names). Only `maintenance` is stored (it is a manual choice).
--           occupied / reserved / available are DERIVED from the stays, so a kennel
--           can never show "available" while a pet is in it.
--
-- CONFLICT RULES (exclusion constraints, so concurrent requests cannot both succeed):
--   * one kennel cannot hold two overlapping active stays;
--   * one pet cannot have two overlapping active stays.
-- "Active" = reserved or occupied, so checking out or cancelling frees the kennel at
-- once, including an early check-out. A stay occupies the nights
-- [check_in_on, check_out_on): a new stay may check in on the day another checks out.
-- A same-day stay (day care: check_out_on = check_in_on) occupies that one day.
--
-- WRITES: the client may only READ these tables. Every write goes through the
-- SECURITY DEFINER functions below, which re-check that the customer, pet, kennel
-- and service belong to the caller's business and never trust client-supplied
-- prices. Deleting a customer or pet that has stays is blocked (RESTRICT): check the
-- pet out or cancel the stay and keep the record. A kennel with any stay history
-- cannot be deleted; put it in maintenance instead.
--
-- NOT in this migration: stay invoicing and deposits (invoices phase), vaccination
-- gating (the screen shows a warning only), kennel capacity types / pricing rules,
-- daily care logs.
--
-- ROLLBACK (destroys kennels and stays only; leaves btree_gist installed):
--   drop function if exists public.pet_set_stay_status(uuid, text);
--   drop function if exists public.pet_update_stay(uuid, uuid, date, date, text, text);
--   drop function if exists public.pet_create_stay(uuid, uuid, uuid, date, date, uuid, text, text, boolean);
--   drop function if exists public.pet_delete_kennel(uuid);
--   drop function if exists public.pet_set_kennel_maintenance(uuid, boolean);
--   drop function if exists public.pet_save_kennel(uuid, text, text, text);
--   drop table if exists public.pet_boarding_stays;
--   drop table if exists public.pet_kennels;

create extension if not exists btree_gist with schema extensions;

create table public.pet_kennels (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  kind text not null default 'Standard' check (btrim(kind) <> '' and char_length(kind) <= 40),
  maintenance boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pet_kennels_salon_name_uidx on public.pet_kennels (salon_id, lower(btrim(name)));

create table public.pet_boarding_stays (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  pet_id uuid not null references public.pet_pets(id) on delete restrict,
  kennel_id uuid not null references public.pet_kennels(id) on delete restrict,
  check_in_on date not null,
  check_out_on date not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'occupied', 'checked-out', 'cancelled')),
  service_id uuid references public.pet_services(id) on delete set null,
  service_name text check (service_name is null or btrim(service_name) <> ''),
  nightly_rate integer check (nightly_rate is null or (nightly_rate >= 0 and nightly_rate <= 10000000)),
  feeding_notes text check (feeding_notes is null or char_length(feeding_notes) <= 500),
  care_notes text check (care_notes is null or char_length(care_notes) <= 500),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_stays_valid_dates check (check_out_on >= check_in_on and check_out_on - check_in_on <= 365),
  constraint pet_stays_no_kennel_overlap exclude using gist (
    kennel_id with =,
    daterange(check_in_on, case when check_out_on = check_in_on then check_in_on + 1 else check_out_on end, '[)') with &&
  ) where (status in ('reserved', 'occupied')),
  constraint pet_stays_no_pet_overlap exclude using gist (
    pet_id with =,
    daterange(check_in_on, case when check_out_on = check_in_on then check_in_on + 1 else check_out_on end, '[)') with &&
  ) where (status in ('reserved', 'occupied'))
);
create index pet_stays_salon_dates_idx on public.pet_boarding_stays (salon_id, check_in_on, check_out_on);
create index pet_stays_pet_idx on public.pet_boarding_stays (pet_id);
create index pet_stays_customer_idx on public.pet_boarding_stays (customer_id);
create index pet_stays_kennel_idx on public.pet_boarding_stays (kennel_id);

create trigger pet_kennels_touch_updated_at
  before update on public.pet_kennels
  for each row execute function public.pet_touch_updated_at();
create trigger pet_boarding_stays_touch_updated_at
  before update on public.pet_boarding_stays
  for each row execute function public.pet_touch_updated_at();

create trigger pet_kennels_audit after insert or update or delete on public.pet_kennels
  for each row execute function public.pet_audit_row();
create trigger pet_boarding_stays_audit after insert or update or delete on public.pet_boarding_stays
  for each row execute function public.pet_audit_row();

alter table public.pet_kennels enable row level security;
alter table public.pet_boarding_stays enable row level security;

create policy "pet_kennels_select_own_salon"
  on public.pet_kennels for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_boarding_stays_select_own_salon"
  on public.pet_boarding_stays for select to authenticated
  using (salon_id = auth_salon_id());

-- Read-only for the client; writes happen only inside the functions below.
revoke all on public.pet_kennels from anon;
revoke all on public.pet_kennels from authenticated;
grant select on public.pet_kennels to authenticated;
revoke all on public.pet_boarding_stays from anon;
revoke all on public.pet_boarding_stays from authenticated;
grant select on public.pet_boarding_stays to authenticated;

-- ---------------------------------------------------------------------------
-- Kennels. Errors (message text the app maps to friendly wording):
-- NOT_AUTHENTICATED, KENNEL_NAME_REQUIRED, KENNEL_NAME_TAKEN, KENNEL_NOT_FOUND,
-- KENNEL_OCCUPIED, KENNEL_HAS_STAYS.
-- ---------------------------------------------------------------------------

create or replace function public.pet_save_kennel(
  p_id uuid,
  p_name text,
  p_kind text,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_kind text := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), 'Standard');
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_name = '' or char_length(v_name) > 60 or char_length(v_kind) > 40 then
    raise exception 'KENNEL_NAME_REQUIRED';
  end if;
  if p_id is null then
    insert into public.pet_kennels (salon_id, name, kind, notes)
    values (v_salon, v_name, v_kind, nullif(btrim(coalesce(p_notes, '')), ''))
    returning id into v_id;
  else
    update public.pet_kennels
       set name = v_name, kind = v_kind, notes = nullif(btrim(coalesce(p_notes, '')), '')
     where id = p_id and salon_id = v_salon
    returning id into v_id;
    if v_id is null then raise exception 'KENNEL_NOT_FOUND'; end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'KENNEL_NAME_TAKEN';
end;
$$;

create or replace function public.pet_set_kennel_maintenance(p_id uuid, p_maintenance boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform 1 from public.pet_kennels where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'KENNEL_NOT_FOUND'; end if;
  if coalesce(p_maintenance, false) and exists (
       select 1 from public.pet_boarding_stays s
        where s.kennel_id = p_id and s.salon_id = v_salon and s.status = 'occupied') then
    raise exception 'KENNEL_OCCUPIED';
  end if;
  update public.pet_kennels set maintenance = coalesce(p_maintenance, false) where id = p_id and salon_id = v_salon;
  return coalesce(p_maintenance, false);
end;
$$;

create or replace function public.pet_delete_kennel(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform 1 from public.pet_kennels where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'KENNEL_NOT_FOUND'; end if;
  delete from public.pet_kennels where id = p_id and salon_id = v_salon;
exception
  when foreign_key_violation then
    raise exception 'KENNEL_HAS_STAYS';
end;
$$;

-- ---------------------------------------------------------------------------
-- Stays. Errors: NOT_AUTHENTICATED, INVALID_DATES, CUSTOMER_NOT_FOUND,
-- PET_NOT_FOUND, KENNEL_NOT_FOUND, KENNEL_MAINTENANCE, SERVICE_NOT_FOUND,
-- STAY_CONFLICT_KENNEL, STAY_CONFLICT_PET, STAY_NOT_FOUND, STAY_NOT_EDITABLE,
-- STAY_CHECKIN_LOCKED, INVALID_STATUS_CHANGE.
-- p_service_id is optional; when given it must be an active Boarding service of the
-- caller's business (its name and price are copied onto the stay).
-- p_check_in_now = true creates the stay already checked in (walk-in arrival).
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

-- Edit a stay that is still reserved or occupied. A reserved stay can change kennel
-- and both dates; an occupied stay can change kennel, check-out date and notes (its
-- check-in date is fixed: p_check_in must equal the recorded one).
create or replace function public.pet_update_stay(
  p_id uuid,
  p_kennel_id uuid,
  p_check_in date,
  p_check_out date,
  p_feeding text default null,
  p_notes text default null
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
  select k.maintenance into v_maint from public.pet_kennels k where k.id = p_kennel_id and k.salon_id = v_salon;
  if not found then raise exception 'KENNEL_NOT_FOUND'; end if;
  if v_maint and p_kennel_id <> v_s.kennel_id then raise exception 'KENNEL_MAINTENANCE'; end if;

  update public.pet_boarding_stays
     set kennel_id = p_kennel_id,
         check_in_on = p_check_in,
         check_out_on = p_check_out,
         feeding_notes = nullif(btrim(coalesce(p_feeding, '')), ''),
         care_notes = nullif(btrim(coalesce(p_notes, '')), '')
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

create or replace function public.pet_set_stay_status(p_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_s public.pet_boarding_stays%rowtype;
  v_maint boolean;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_s from public.pet_boarding_stays where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'STAY_NOT_FOUND'; end if;
  if not (
       (v_s.status = 'reserved' and p_status in ('occupied', 'cancelled'))
    or (v_s.status = 'occupied' and p_status = 'checked-out')
  ) then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;
  if p_status = 'occupied' then
    select k.maintenance into v_maint from public.pet_kennels k where k.id = v_s.kennel_id and k.salon_id = v_salon;
    if coalesce(v_maint, false) then raise exception 'KENNEL_MAINTENANCE'; end if;
  end if;
  update public.pet_boarding_stays
     set status = p_status,
         checked_in_at = case when p_status = 'occupied' then now() else checked_in_at end,
         checked_out_at = case when p_status = 'checked-out' then now() else checked_out_at end
   where id = p_id and salon_id = v_salon;
  return p_status;
end;
$$;

-- This project's default privileges grant EXECUTE on new functions to anon and
-- authenticated, so revoke explicitly and grant back to authenticated only.
revoke execute on function public.pet_save_kennel(uuid, text, text, text) from public, anon;
revoke execute on function public.pet_set_kennel_maintenance(uuid, boolean) from public, anon;
revoke execute on function public.pet_delete_kennel(uuid) from public, anon;
revoke execute on function public.pet_create_stay(uuid, uuid, uuid, date, date, uuid, text, text, boolean) from public, anon;
revoke execute on function public.pet_update_stay(uuid, uuid, date, date, text, text) from public, anon;
revoke execute on function public.pet_set_stay_status(uuid, text) from public, anon;
grant execute on function public.pet_save_kennel(uuid, text, text, text) to authenticated;
grant execute on function public.pet_set_kennel_maintenance(uuid, boolean) to authenticated;
grant execute on function public.pet_delete_kennel(uuid) to authenticated;
grant execute on function public.pet_create_stay(uuid, uuid, uuid, date, date, uuid, text, text, boolean) to authenticated;
grant execute on function public.pet_update_stay(uuid, uuid, date, date, text, text) to authenticated;
grant execute on function public.pet_set_stay_status(uuid, text) to authenticated;
