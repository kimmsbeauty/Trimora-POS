-- 108_pet_public_booking.sql
--
-- Trimora Pet -- public online booking REQUESTS.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 108".
--
-- WHAT THIS IS: a public page (/<slug>/pet/book) where a pet owner picks grooming
-- services and a free time and sends a REQUEST. It is NOT an instant booking: staff
-- see the request in the app and accept (which creates the customer, pet and booking
-- through the existing pet_create_booking, so every conflict rule still applies) or
-- decline it. Requests do not hold a slot, so two people can ask for the same time;
-- staff resolve that when accepting.
--
-- ANONYMOUS ACCESS IS DELIBERATELY TINY. Visitors (role anon) can execute exactly three
-- functions and can read no table at all:
--   pet_public_booking_info(salon)        -> opening hours, slot rules and the ACTIVE
--                                           grooming service catalogue (name, duration,
--                                           price). Returns {enabled:false} unless the
--                                           business is a pet business, not suspended,
--                                           has the pet module on AND switched online
--                                           booking on.
--   pet_public_slots(salon, date, svc[])  -> start times that are free. Times only: no
--                                           names, no pets, no counts, no bookings.
--   pet_public_submit_request(...)        -> stores one request; returns only a
--                                           reference code. Never reveals whether the
--                                           phone number belongs to an existing customer.
-- Business errors come back as {ok:false, error:CODE} (not exceptions) so the page can
-- show a useful message.
--
-- ABUSE CONTROLS: online booking is OFF by default per business; a hidden "website"
-- field catches simple bots (they get a fake success and nothing is stored); at most 3
-- requests per phone number per 24 h and 40 per business per hour; the requested time
-- is re-checked on the server (opening hours, slot grid, notice period, how far ahead,
-- capacity); every field is length-limited; consent to be contacted is required.
-- Services shown/booked online: Grooming and Add-on with a duration set. Boarding
-- (multi-day) is NOT bookable online in this release.
--
-- STAFF SIDE (signed-in app only): pet_accept_booking_request, pet_decline_booking_request,
-- pet_save_public_booking_settings. Customers created from a request are marked
-- marketing_opt_out = true (they asked for a booking, not for marketing).
-- The staff functions are NOT role-restricted: like the rest of Pet, roles are not
-- enforced in the database yet.
--
-- PERSONAL DATA: requests hold a name and phone number. There is no automatic deletion
-- yet; plan a retention rule before heavy use.
--
-- ADDITIVE ONLY: two new tables plus helper and RPC functions. Nothing
-- existing changes. Needs 083, 085, 087, 088/092 and the platform salons /
-- salon_enabled_modules / customers / staff tables.
--
-- ROLLBACK (loses settings and requests only):
--   drop function if exists public.pet_save_public_booking_settings(boolean, text, integer, integer, integer, integer, jsonb);
--   drop function if exists public.pet_decline_booking_request(uuid, text);
--   drop function if exists public.pet_accept_booking_request(uuid, uuid, timestamptz);
--   drop function if exists public.pet_public_submit_request(uuid, uuid[], timestamptz, text, text, text, text, text, text, boolean, text);
--   drop function if exists public.pet_public_slots(uuid, date, uuid[]);
--   drop function if exists public.pet_public_booking_info(uuid);
--   drop function if exists public.pet_public_slot_check(uuid, timestamptz, integer);
--   drop function if exists public.pet_public_is_open(uuid);
--   drop function if exists public.pet_public_service_minutes(uuid, uuid[]);
--   drop function if exists public.pet_norm_phone(text);
--   drop table if exists public.pet_booking_requests;
--   drop table if exists public.pet_public_booking_settings;
--   drop function if exists public.pet_hours_valid(jsonb);

-- ---------------------------------------------------------------------------
-- helpers (not callable by the app or by visitors)
-- ---------------------------------------------------------------------------

-- Opening hours: [{"weekday":1,"open":"09:00","close":"17:00"}, ...]  weekday 0=Sunday..6.
create or replace function public.pet_hours_valid(h jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  e jsonb; seen integer[] := '{}'; wd integer; o integer; c integer;
begin
  if h is null or jsonb_typeof(h) <> 'array' or jsonb_array_length(h) > 7 then return false; end if;
  for e in select * from jsonb_array_elements(h) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if coalesce(e->>'weekday', '') !~ '^[0-6]$' then return false; end if;
    if coalesce(e->>'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if coalesce(e->>'close', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    wd := (e->>'weekday')::integer;
    o := split_part(e->>'open', ':', 1)::integer * 60 + split_part(e->>'open', ':', 2)::integer;
    c := split_part(e->>'close', ':', 1)::integer * 60 + split_part(e->>'close', ':', 2)::integer;
    if c <= o or wd = any (seen) then return false; end if;
    seen := seen || wd;
  end loop;
  return true;
end;
$$;

-- Same rules as normalizePhone() in the app: Kenyan 07xx/01xx/7xx/254..., or an explicit
-- +international number. Returns digits only, or NULL when it isn't a usable number.
create or replace function public.pet_norm_phone(p_raw text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  s text := btrim(coalesce(p_raw, ''));
  d text;
  plus boolean;
begin
  if s = '' then return null; end if;
  plus := left(s, 1) = '+';
  d := regexp_replace(s, '\D', '', 'g');
  if d ~ '^254[17][0-9]{8}$' then return d; end if;
  if d ~ '^0[17][0-9]{8}$' then return '254' || substr(d, 2); end if;
  if d ~ '^[17][0-9]{8}$' and not plus then return '254' || d; end if;
  if plus and length(d) between 8 and 15 and left(d, 1) <> '0' then return d; end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.pet_public_booking_settings (
  id uuid primary key default gen_random_uuid(),            -- pet_audit_row needs an id column
  salon_id uuid not null unique references public.salons(id) on delete cascade,
  enabled boolean not null default false,
  timezone text not null default 'Africa/Nairobi',
  slot_minutes integer not null default 30 check (slot_minutes in (15, 30, 45, 60, 90, 120)),
  lead_hours integer not null default 4 check (lead_hours between 0 and 168),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 180),
  capacity integer not null default 1 check (capacity between 1 and 20),
  hours jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_public_booking_hours_valid check (public.pet_hours_valid(hours)),
  constraint pet_public_booking_enabled_has_hours check (not enabled or jsonb_array_length(hours) > 0)
);

create table public.pet_booking_requests (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  reference text not null check (reference ~ '^R-[0-9A-F]{8}$'),
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  service_ids uuid[] not null check (cardinality(service_ids) between 1 and 5),
  service_summary text not null check (btrim(service_summary) <> '' and char_length(service_summary) <= 300),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 1 and 480),
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 80),
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  pet_name text not null check (char_length(btrim(pet_name)) between 1 and 60),
  species text not null check (species in ('Dog', 'Cat', 'Rabbit', 'Other')),
  breed text check (breed is null or char_length(breed) <= 60),
  notes text check (notes is null or char_length(notes) <= 300),
  consent_at timestamptz not null,
  booking_id uuid references public.pet_bookings(id) on delete set null,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 200),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_booking_requests_handled check ((status = 'new') = (handled_at is null))
);
create unique index pet_booking_requests_ref_uidx on public.pet_booking_requests (salon_id, reference);
create index pet_booking_requests_status_idx on public.pet_booking_requests (salon_id, status, created_at desc);
create index pet_booking_requests_phone_idx on public.pet_booking_requests (salon_id, phone, created_at desc);

create trigger pet_public_booking_settings_touch before update on public.pet_public_booking_settings
  for each row execute function public.pet_touch_updated_at();
create trigger pet_booking_requests_touch before update on public.pet_booking_requests
  for each row execute function public.pet_touch_updated_at();
create trigger pet_public_booking_settings_audit after insert or update or delete on public.pet_public_booking_settings
  for each row execute function public.pet_audit_row();
create trigger pet_booking_requests_audit after insert or update or delete on public.pet_booking_requests
  for each row execute function public.pet_audit_row();

alter table public.pet_public_booking_settings enable row level security;
alter table public.pet_booking_requests enable row level security;
create policy "pet_public_booking_settings_select_own_salon"
  on public.pet_public_booking_settings for select to authenticated using (salon_id = auth_salon_id());
create policy "pet_booking_requests_select_own_salon"
  on public.pet_booking_requests for select to authenticated using (salon_id = auth_salon_id());

-- The app can only READ these tables; every change goes through the functions below.
revoke all on public.pet_public_booking_settings from anon, authenticated;
revoke all on public.pet_booking_requests from anon, authenticated;
grant select on public.pet_public_booking_settings to authenticated;
grant select on public.pet_booking_requests to authenticated;

-- ---------------------------------------------------------------------------
-- internal checks shared by the public functions
-- ---------------------------------------------------------------------------

-- Is online booking really on for this business? (pet business, not suspended, pet module
-- enabled, switch on.)
create or replace function public.pet_public_is_open(p_salon uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.salons s
    join public.pet_public_booking_settings b on b.salon_id = s.id and b.enabled
    where s.id = p_salon
      and s.business_type = 'pet'
      and not coalesce(s.suspended, false)
      and exists (select 1 from public.salon_enabled_modules m
                  where m.salon_id = s.id and m.module_key = 'pet' and m.enabled)
  );
$$;

-- Validates the chosen services and returns their total minutes, or NULL if any is not
-- bookable online (wrong business, inactive, Boarding, no duration, duplicate, too many,
-- or longer than 8 hours in total).
create or replace function public.pet_public_service_minutes(p_salon uuid, p_service_ids uuid[])
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_total integer;
begin
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_service_ids, '{}'::uuid[])) as x;
  if v_ids is null or cardinality(v_ids) < 1 or cardinality(v_ids) > 5 then return null; end if;
  select sum(s.duration_minutes) into v_total
    from public.pet_services s
   where s.id = any (v_ids) and s.salon_id = p_salon and s.active
     and s.category <> 'Boarding' and s.duration_minutes is not null;
  if (select count(*) from public.pet_services s
       where s.id = any (v_ids) and s.salon_id = p_salon and s.active
         and s.category <> 'Boarding' and s.duration_minutes is not null) <> cardinality(v_ids) then
    return null;
  end if;
  if v_total is null or v_total < 1 or v_total > 480 then return null; end if;
  return v_total;
end;
$$;

-- NULL = this start time can be requested; otherwise an error code:
-- NOT_AVAILABLE, TOO_SOON, TOO_FAR, CLOSED, OUTSIDE_HOURS, NOT_A_SLOT, SLOT_FULL.
create or replace function public.pet_public_slot_check(p_salon uuid, p_start timestamptz, p_minutes integer)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  b public.pet_public_booking_settings;
  v_local timestamp;
  v_wd integer;
  v_h jsonb;
  v_open integer; v_close integer; v_start_min integer;
  v_busy integer;
begin
  if p_start is null or p_minutes is null or p_minutes < 1 then return 'NOT_AVAILABLE'; end if;
  if not public.pet_public_is_open(p_salon) then return 'NOT_AVAILABLE'; end if;
  select * into b from public.pet_public_booking_settings where salon_id = p_salon;
  if p_start < now() + make_interval(hours => b.lead_hours) then return 'TOO_SOON'; end if;
  v_local := p_start at time zone b.timezone;
  if v_local::date > (now() at time zone b.timezone)::date + b.max_days_ahead then return 'TOO_FAR'; end if;
  v_wd := extract(dow from v_local)::integer;
  select e into v_h from jsonb_array_elements(b.hours) e where (e->>'weekday')::integer = v_wd limit 1;
  if v_h is null then return 'CLOSED'; end if;
  v_open := split_part(v_h->>'open', ':', 1)::integer * 60 + split_part(v_h->>'open', ':', 2)::integer;
  v_close := split_part(v_h->>'close', ':', 1)::integer * 60 + split_part(v_h->>'close', ':', 2)::integer;
  v_start_min := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  if extract(second from v_local) <> 0 then return 'NOT_A_SLOT'; end if;
  if v_start_min < v_open or v_start_min + p_minutes > v_close then return 'OUTSIDE_HOURS'; end if;
  if (v_start_min - v_open) % b.slot_minutes <> 0 then return 'NOT_A_SLOT'; end if;
  select count(*) into v_busy from public.pet_bookings k
   where k.salon_id = p_salon and k.status not in ('cancelled', 'no-show')
     and k.starts_at < p_start + make_interval(mins => p_minutes) and k.ends_at > p_start;
  if v_busy >= b.capacity then return 'SLOT_FULL'; end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- public (anon) functions
-- ---------------------------------------------------------------------------

create or replace function public.pet_public_booking_info(p_salon_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  b public.pet_public_booking_settings;
begin
  if p_salon_id is null or not public.pet_public_is_open(p_salon_id) then
    return jsonb_build_object('enabled', false);
  end if;
  select * into b from public.pet_public_booking_settings where salon_id = p_salon_id;
  return jsonb_build_object(
    'enabled', true,
    'timezone', b.timezone,
    'slot_minutes', b.slot_minutes,
    'lead_hours', b.lead_hours,
    'max_days_ahead', b.max_days_ahead,
    'hours', b.hours,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'category', s.category, 'description', s.description,
               'duration_minutes', s.duration_minutes, 'price', s.price, 'species', s.species)
             order by s.category, s.name)
        from public.pet_services s
       where s.salon_id = p_salon_id and s.active and s.category <> 'Boarding' and s.duration_minutes is not null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pet_public_slots(p_salon_id uuid, p_date date, p_service_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  b public.pet_public_booking_settings;
  v_minutes integer;
  v_wd integer;
  v_h jsonb;
  v_open integer; v_close integer; v_m integer;
  v_start timestamptz;
  v_slots jsonb := '[]'::jsonb;
begin
  if p_salon_id is null or not public.pet_public_is_open(p_salon_id) then
    return jsonb_build_object('ok', false, 'error', 'NOT_AVAILABLE');
  end if;
  if p_date is null then return jsonb_build_object('ok', false, 'error', 'INVALID_DATE'); end if;
  v_minutes := public.pet_public_service_minutes(p_salon_id, p_service_ids);
  if v_minutes is null then return jsonb_build_object('ok', false, 'error', 'INVALID_SERVICES'); end if;
  select * into b from public.pet_public_booking_settings where salon_id = p_salon_id;
  if p_date < (now() at time zone b.timezone)::date or p_date > (now() at time zone b.timezone)::date + b.max_days_ahead then
    return jsonb_build_object('ok', true, 'slots', v_slots, 'minutes', v_minutes);
  end if;
  v_wd := extract(dow from p_date)::integer;
  select e into v_h from jsonb_array_elements(b.hours) e where (e->>'weekday')::integer = v_wd limit 1;
  if v_h is null then return jsonb_build_object('ok', true, 'slots', v_slots, 'minutes', v_minutes); end if;
  v_open := split_part(v_h->>'open', ':', 1)::integer * 60 + split_part(v_h->>'open', ':', 2)::integer;
  v_close := split_part(v_h->>'close', ':', 1)::integer * 60 + split_part(v_h->>'close', ':', 2)::integer;
  v_m := v_open;
  while v_m + v_minutes <= v_close loop
    v_start := (p_date::timestamp + make_interval(mins => v_m)) at time zone b.timezone;
    if public.pet_public_slot_check(p_salon_id, v_start, v_minutes) is null then
      v_slots := v_slots || to_jsonb(to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    end if;
    v_m := v_m + b.slot_minutes;
  end loop;
  return jsonb_build_object('ok', true, 'slots', v_slots, 'minutes', v_minutes);
end;
$$;

create or replace function public.pet_public_submit_request(
  p_salon_id uuid, p_service_ids uuid[], p_starts_at timestamptz,
  p_customer_name text, p_phone text, p_pet_name text, p_species text,
  p_breed text, p_notes text, p_consent boolean, p_website text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_pet text := btrim(coalesce(p_pet_name, ''));
  v_breed text := nullif(btrim(coalesce(p_breed, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_phone text := public.pet_norm_phone(p_phone);
  v_minutes integer;
  v_check text;
  v_summary text;
  v_ref text;
  v_existing text;
  v_ids uuid[];
  v_try integer := 0;
begin
  -- Bots fill the hidden field: pretend success, store nothing.
  if btrim(coalesce(p_website, '')) <> '' then
    return jsonb_build_object('ok', true, 'reference', 'R-' || upper(substr(md5(random()::text), 1, 8)));
  end if;
  if p_salon_id is null or not public.pet_public_is_open(p_salon_id) then
    return jsonb_build_object('ok', false, 'error', 'NOT_AVAILABLE');
  end if;
  if coalesce(p_consent, false) is not true then return jsonb_build_object('ok', false, 'error', 'CONSENT_REQUIRED'); end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then return jsonb_build_object('ok', false, 'error', 'INVALID_NAME'); end if;
  if v_phone is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PHONE'); end if;
  if char_length(v_pet) < 1 or char_length(v_pet) > 60 then return jsonb_build_object('ok', false, 'error', 'INVALID_PET'); end if;
  if p_species is null or p_species not in ('Dog', 'Cat', 'Rabbit', 'Other') then return jsonb_build_object('ok', false, 'error', 'INVALID_SPECIES'); end if;
  if v_breed is not null and char_length(v_breed) > 60 then return jsonb_build_object('ok', false, 'error', 'INVALID_BREED'); end if;
  if v_notes is not null and char_length(v_notes) > 300 then return jsonb_build_object('ok', false, 'error', 'NOTES_TOO_LONG'); end if;
  v_minutes := public.pet_public_service_minutes(p_salon_id, p_service_ids);
  if v_minutes is null then return jsonb_build_object('ok', false, 'error', 'INVALID_SERVICES'); end if;

  -- same person asking again for the same thing: return the original reference
  select reference into v_existing from public.pet_booking_requests
   where salon_id = p_salon_id and phone = v_phone and starts_at = p_starts_at
     and lower(btrim(pet_name)) = lower(v_pet) and status = 'new' limit 1;
  if v_existing is not null then return jsonb_build_object('ok', true, 'reference', v_existing); end if;

  if (select count(*) from public.pet_booking_requests
       where salon_id = p_salon_id and phone = v_phone and created_at > now() - interval '24 hours') >= 3
     or (select count(*) from public.pet_booking_requests
          where salon_id = p_salon_id and created_at > now() - interval '1 hour') >= 40 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY_REQUESTS');
  end if;

  v_check := public.pet_public_slot_check(p_salon_id, p_starts_at, v_minutes);
  if v_check is not null then return jsonb_build_object('ok', false, 'error', v_check); end if;

  select array_agg(distinct x) into v_ids from unnest(p_service_ids) as x;
  select string_agg(s.name, ', ' order by s.name) into v_summary from public.pet_services s where s.id = any (v_ids);

  loop
    v_try := v_try + 1;
    v_ref := 'R-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    begin
      insert into public.pet_booking_requests
        (salon_id, reference, service_ids, service_summary, starts_at, duration_minutes,
         customer_name, phone, pet_name, species, breed, notes, consent_at)
      values
        (p_salon_id, v_ref, v_ids, left(v_summary, 300), p_starts_at, v_minutes,
         v_name, v_phone, v_pet, p_species, v_breed, v_notes, now());
      exit;
    exception when unique_violation then
      if v_try >= 5 then return jsonb_build_object('ok', false, 'error', 'TRY_AGAIN'); end if;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$$;

-- ---------------------------------------------------------------------------
-- staff functions (signed-in app only)
-- Errors: NOT_AUTHENTICATED, REQUEST_NOT_FOUND, REQUEST_NOT_NEW, START_IN_PAST, PET_ARCHIVED,
-- plus everything pet_create_booking raises (BOOKING_CONFLICT_STAFF, BOOKING_CONFLICT_PET,
-- SERVICE_NOT_FOUND, STAFF_NOT_FOUND, ...). Any failure rolls the whole accept back, so a
-- failed accept never leaves a half-made customer or pet behind.
-- ---------------------------------------------------------------------------

create or replace function public.pet_accept_booking_request(p_request_id uuid, p_staff_id uuid default null, p_starts_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  r public.pet_booking_requests;
  v_start timestamptz;
  v_customer uuid;
  v_pet uuid;
  v_arch timestamptz;
  v_booking uuid;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into r from public.pet_booking_requests where id = p_request_id and salon_id = v_salon for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status = 'accepted' and r.booking_id is not null then return r.booking_id; end if;
  if r.status <> 'new' then raise exception 'REQUEST_NOT_NEW'; end if;

  v_start := coalesce(p_starts_at, r.starts_at);
  if v_start < now() then raise exception 'START_IN_PAST'; end if;

  select c.id into v_customer from public.customers c
   where c.salon_id = v_salon and public.pet_norm_phone(c.phone) = r.phone
   order by c.id limit 1;
  if v_customer is null then
    insert into public.customers (salon_id, name, phone, marketing_opt_out)
    values (v_salon, r.customer_name, r.phone, true) returning id into v_customer;
  end if;

  select p.id, p.archived_at into v_pet, v_arch from public.pet_pets p
   where p.salon_id = v_salon and p.customer_id = v_customer and lower(btrim(p.name)) = lower(btrim(r.pet_name))
   order by p.archived_at nulls first limit 1;
  if v_pet is not null and v_arch is not null then raise exception 'PET_ARCHIVED'; end if;
  if v_pet is null then
    insert into public.pet_pets (salon_id, customer_id, name, species, breed)
    values (v_salon, v_customer, r.pet_name, r.species, r.breed) returning id into v_pet;
  end if;

  v_booking := public.pet_create_booking(
    v_customer, v_pet, p_staff_id, v_start, v_start + make_interval(mins => r.duration_minutes), r.service_ids, false,
    left('Online request ' || r.reference || coalesce(': ' || r.notes, ''), 500));

  update public.pet_booking_requests set status = 'accepted', booking_id = v_booking, handled_at = now() where id = r.id;
  return v_booking;
end;
$$;

create or replace function public.pet_decline_booking_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  r public.pet_booking_requests;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into r from public.pet_booking_requests where id = p_request_id and salon_id = v_salon for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status = 'declined' then return; end if;
  if r.status <> 'new' then raise exception 'REQUEST_NOT_NEW'; end if;
  update public.pet_booking_requests
     set status = 'declined', handled_at = now(), decline_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 200)
   where id = r.id;
end;
$$;

-- Errors: NOT_AUTHENTICATED, INVALID_TIMEZONE, INVALID_HOURS, HOURS_REQUIRED, INVALID_SETTINGS.
create or replace function public.pet_save_public_booking_settings(
  p_enabled boolean, p_timezone text, p_slot_minutes integer, p_lead_hours integer,
  p_max_days_ahead integer, p_capacity integer, p_hours jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_tz text := btrim(coalesce(p_timezone, ''));
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'INVALID_TIMEZONE'; end if;
  if not public.pet_hours_valid(p_hours) then raise exception 'INVALID_HOURS'; end if;
  if coalesce(p_enabled, false) and jsonb_array_length(p_hours) = 0 then raise exception 'HOURS_REQUIRED'; end if;
  if p_slot_minutes is null or p_slot_minutes not in (15, 30, 45, 60, 90, 120)
     or p_lead_hours is null or p_lead_hours not between 0 and 168
     or p_max_days_ahead is null or p_max_days_ahead not between 1 and 180
     or p_capacity is null or p_capacity not between 1 and 20 then
    raise exception 'INVALID_SETTINGS';
  end if;
  insert into public.pet_public_booking_settings
    (salon_id, enabled, timezone, slot_minutes, lead_hours, max_days_ahead, capacity, hours)
  values
    (v_salon, coalesce(p_enabled, false), v_tz, p_slot_minutes, p_lead_hours, p_max_days_ahead, p_capacity, p_hours)
  on conflict (salon_id) do update set
    enabled = excluded.enabled, timezone = excluded.timezone, slot_minutes = excluded.slot_minutes,
    lead_hours = excluded.lead_hours, max_days_ahead = excluded.max_days_ahead,
    capacity = excluded.capacity, hours = excluded.hours;
end;
$$;

-- ---------------------------------------------------------------------------
-- grants. This project's default privileges give new functions to anon and
-- authenticated, so everything is revoked first and then granted narrowly.
-- ---------------------------------------------------------------------------
revoke execute on function public.pet_hours_valid(jsonb) from public, anon, authenticated;
revoke execute on function public.pet_norm_phone(text) from public, anon, authenticated;
revoke execute on function public.pet_public_is_open(uuid) from public, anon, authenticated;
revoke execute on function public.pet_public_service_minutes(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.pet_public_slot_check(uuid, timestamptz, integer) from public, anon, authenticated;

revoke execute on function public.pet_public_booking_info(uuid) from public;
revoke execute on function public.pet_public_slots(uuid, date, uuid[]) from public;
revoke execute on function public.pet_public_submit_request(uuid, uuid[], timestamptz, text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.pet_public_booking_info(uuid) to anon, authenticated;
grant execute on function public.pet_public_slots(uuid, date, uuid[]) to anon, authenticated;
grant execute on function public.pet_public_submit_request(uuid, uuid[], timestamptz, text, text, text, text, text, text, boolean, text) to anon, authenticated;

revoke execute on function public.pet_accept_booking_request(uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.pet_decline_booking_request(uuid, text) from public, anon;
revoke execute on function public.pet_save_public_booking_settings(boolean, text, integer, integer, integer, integer, jsonb) from public, anon;
grant execute on function public.pet_accept_booking_request(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.pet_decline_booking_request(uuid, text) to authenticated;
grant execute on function public.pet_save_public_booking_settings(boolean, text, integer, integer, integer, integer, jsonb) to authenticated;
