-- 088_pet_bookings.sql
--
-- Trimora Pet -- Phase 6: bookings (appointments) with database-level conflict
-- prevention.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 088".
--
-- ADDITIVE ONLY: installs btree_gist (needed for uuid + time-range exclusion
-- constraints) and adds two tables and three functions. Nothing existing is
-- altered; Salon and Auto are untouched.
--
-- WHY RPCs: a booking and its service lines must be created together, status
-- changes must follow the allowed order, and a conflict must come back as a
-- clear error. So the client may only READ these tables; every write goes
-- through the three SECURITY DEFINER functions below, which re-check tenant
-- ownership themselves (customer, pet, staff and services must all belong to
-- the caller's business) and never trust client-supplied prices.
--
-- CONFLICT RULES (enforced by exclusion constraints, so concurrent requests
-- cannot both succeed):
--   * the same staff member cannot have two overlapping active bookings;
--   * the same pet cannot have two overlapping active bookings.
-- "Active" means every status except cancelled and no-show, so cancelling or
-- marking a no-show frees the slot. Ranges are half-open [start, end): a booking
-- may start exactly when another ends.
--
-- STATUSES (assumption: spelling follows the repo spec, e.g. "checked-in",
-- "in-progress"; the Lovable prototype could not be read when this was written):
--   pending, confirmed, checked-in, in-progress, completed, cancelled, no-show
-- Allowed moves:
--   pending     -> confirmed, checked-in, cancelled
--   confirmed   -> checked-in, cancelled, no-show
--   checked-in  -> in-progress, cancelled
--   in-progress -> completed
--   completed / cancelled / no-show are final.
--
-- TIME: all times are timestamptz (UTC in storage). The app shows them in the
-- browser's local time; Kenya has no daylight saving.
--
-- NOT in this migration: working hours / availability rules (settings phase),
-- changing the services on an existing booking (cancel and rebook for now),
-- public online booking.
--
-- ROLLBACK (destroys booking rows only; leaves btree_gist installed):
--   drop function if exists public.pet_set_booking_status(uuid, text);
--   drop function if exists public.pet_update_booking(uuid, uuid, timestamptz, timestamptz, text);
--   drop function if exists public.pet_create_booking(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text);
--   drop table if exists public.pet_booking_services;
--   drop table if exists public.pet_bookings;

create extension if not exists btree_gist with schema extensions;

create table public.pet_bookings (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  pet_id uuid not null references public.pet_pets(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show')),
  walk_in boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_bookings_valid_range check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  constraint pet_bookings_no_staff_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (staff_id is not null and status not in ('cancelled', 'no-show')),
  constraint pet_bookings_no_pet_overlap exclude using gist (
    pet_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no-show'))
);

create index pet_bookings_salon_start_idx on public.pet_bookings (salon_id, starts_at);
create index pet_bookings_pet_idx on public.pet_bookings (pet_id);
create index pet_bookings_customer_idx on public.pet_bookings (customer_id);

-- Service lines copy name, price and duration from the catalogue AT BOOKING TIME,
-- so later catalogue edits never rewrite an existing booking.
create table public.pet_booking_services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  booking_id uuid not null references public.pet_bookings(id) on delete cascade,
  service_id uuid not null references public.pet_services(id) on delete restrict,
  service_name text not null,
  price integer not null check (price >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  created_at timestamptz not null default now(),
  unique (booking_id, service_id)
);
create index pet_booking_services_salon_idx on public.pet_booking_services (salon_id, booking_id);

create trigger pet_bookings_touch_updated_at
  before update on public.pet_bookings
  for each row execute function public.pet_touch_updated_at();

create trigger pet_bookings_audit after insert or update or delete on public.pet_bookings
  for each row execute function public.pet_audit_row();
create trigger pet_booking_services_audit after insert or update or delete on public.pet_booking_services
  for each row execute function public.pet_audit_row();

alter table public.pet_bookings enable row level security;
alter table public.pet_booking_services enable row level security;

create policy "pet_bookings_select_own_salon"
  on public.pet_bookings for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_booking_services_select_own_salon"
  on public.pet_booking_services for select to authenticated
  using (salon_id = auth_salon_id());

-- Read-only for the client; writes happen only inside the functions below.
revoke all on public.pet_bookings from anon;
revoke all on public.pet_bookings from authenticated;
grant select on public.pet_bookings to authenticated;
revoke all on public.pet_booking_services from anon;
revoke all on public.pet_booking_services from authenticated;
grant select on public.pet_booking_services to authenticated;

-- ---------------------------------------------------------------------------
-- pet_create_booking: one transaction, booking + service lines.
-- Walk-ins start as checked-in; everything else starts as confirmed.
-- Errors (message text the app maps to friendly wording): NOT_AUTHENTICATED,
-- INVALID_TIME_RANGE, NO_SERVICES, CUSTOMER_NOT_FOUND, PET_NOT_FOUND,
-- STAFF_NOT_FOUND, SERVICE_NOT_FOUND, BOOKING_CONFLICT_STAFF, BOOKING_CONFLICT_PET.
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

-- This project's default privileges grant EXECUTE on new functions to anon and
-- authenticated; keep anon out and give the app (authenticated) access only.
revoke execute on function public.pet_create_booking(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text) from public, anon;
revoke execute on function public.pet_update_booking(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.pet_set_booking_status(uuid, text) from public, anon;
grant execute on function public.pet_create_booking(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text) to authenticated;
grant execute on function public.pet_update_booking(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.pet_set_booking_status(uuid, text) to authenticated;
