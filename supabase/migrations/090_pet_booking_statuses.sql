-- 090_pet_booking_statuses.sql
--
-- Trimora Pet -- align booking statuses with the approved prototype.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner reviews this SQL and says "apply 090".
--
-- WHY: 088 was written before the Lovable prototype could be read, so it assumed the
-- statuses pending / confirmed / checked-in / in-progress / completed / cancelled /
-- no-show. The approved prototype (and the spec's Checkout, which links a sale to a
-- checked-in / in-progress / ready booking) uses booked / checked-in / in-progress /
-- ready / completed / cancelled. Owner decision (Option C): the prototype's six
-- statuses PLUS no-show.
--
--   old (088)              new (090)
--   pending, confirmed  -> booked
--   checked-in          -> checked-in      (unchanged)
--   in-progress         -> in-progress     (unchanged)
--   (none)              -> ready           (NEW: "Ready for Collection")
--   completed           -> completed       (unchanged)
--   cancelled           -> cancelled       (unchanged)
--   no-show             -> no-show         (unchanged)
--
-- ALLOWED MOVES (same shape as 088, with the new ready stage):
--   booked      -> checked-in, cancelled, no-show
--   checked-in  -> in-progress, cancelled
--   in-progress -> ready
--   ready       -> completed
--   completed / cancelled / no-show are final.
-- Walk-ins still start as checked-in; every other new booking now starts as booked.
-- Only booked and checked-in bookings can be rescheduled (as before).
--
-- WHAT CHANGES: the status CHECK constraint, the column default ('confirmed' ->
-- 'booked'), and the bodies of three existing functions (pet_create_booking,
-- pet_update_booking, pet_set_booking_status). Their signatures, grants and security
-- settings are unchanged. One small hardening in pet_set_booking_status: a NULL status
-- now returns the normal INVALID_STATUS_CHANGE error instead of a raw database error.
--
-- WHAT DOES NOT CHANGE: tables, columns, indexes, policies, triggers, the two overlap
-- (no double-booking) exclusion constraints -- they already treat every status except
-- cancelled and no-show as active, so ready and completed bookings keep holding their
-- slot -- and pet_booking_services. Salon and Auto are untouched.
--
-- DATA: existing pending / confirmed rows (if any) are converted to booked. At the time
-- of writing production has 0 bookings, so nothing is converted. The constraint is
-- dropped before the conversion and re-added after it, all in one transaction: if any
-- step fails, nothing is changed. The first step uses a plain DROP CONSTRAINT (no
-- IF EXISTS) on purpose, so an unexpected constraint name fails loudly and rolls back.
--
-- ROLLBACK / RECOVERY: supabase/sql/090_rollback_pet_booking_statuses.sql restores the
-- 088 behaviour in one transaction (constraint, default and the three function bodies,
-- copied verbatim from 088). Information that cannot be represented again: booked rows
-- become confirmed (pending is not recreated) and ready rows become in-progress.
-- Because the data change is only a relabel, no row is ever lost either way. The
-- application code must be rolled back together with the database (the previous
-- application release speaks the 088 statuses).

alter table public.pet_bookings drop constraint pet_bookings_status_check;

update public.pet_bookings set status = 'booked' where status in ('pending', 'confirmed');

alter table public.pet_bookings add constraint pet_bookings_status_check
  check (status in ('booked', 'checked-in', 'in-progress', 'ready', 'completed', 'cancelled', 'no-show'));

alter table public.pet_bookings alter column status set default 'booked';

-- pet_create_booking: unchanged except that a non-walk-in booking now starts as
-- 'booked' (was 'confirmed'). Walk-ins still start as checked-in.
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

-- ---------------------------------------------------------------------------
-- pet_update_booking: reschedule / reassign / edit notes. Only while the booking
-- is booked or checked-in. Passing p_staff_id = null unassigns.
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
  if v_status not in ('booked', 'checked-in') then raise exception 'BOOKING_NOT_EDITABLE'; end if;
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
  if p_status is null or not (
       (v_status = 'booked'      and p_status in ('checked-in', 'cancelled', 'no-show'))
    or (v_status = 'checked-in'  and p_status in ('in-progress', 'cancelled'))
    or (v_status = 'in-progress' and p_status = 'ready')
    or (v_status = 'ready'       and p_status = 'completed')
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
