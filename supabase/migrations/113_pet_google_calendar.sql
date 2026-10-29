-- 113_pet_google_calendar.sql
--
-- Trimora Pet -- one-way sync of grooming bookings and boarding stays to a business's Google Calendar.
--
-- STATUS: APPLIED to production 2026-10-28 (schema_migrations 20261028120618 "pet_google_calendar").
-- The pet-calendar-sync edge function needs it and is deployed separately. Nothing syncs until a
-- business switches it on in Settings.
--
-- HOW IT WORKS: a business shares its Google Calendar with Trimora's service account and saves the
-- calendar id in Settings. From then on, every change to a booking or boarding stay writes one row to
-- pet_calendar_outbox (trigger). The pet-calendar-sync edge function (service role) reads the outbox,
-- rebuilds the event from the saved booking, and creates / updates / deletes the Google event. The link
-- between a booking and its Google event is kept in pet_calendar_events.
--
-- THE APP CAN ONLY READ its own pet_calendar_connections row (to show status). The switch and calendar
-- id are saved through pet_save_calendar_connection(); "resync" goes through pet_calendar_resync().
-- The outbox and event-link tables are not visible to the app at all.
--
-- PRIVACY: the function never sends booking notes, feeding notes or care notes to Google. See the
-- function's lib.js for exactly what an event contains.
--
-- ADDITIVE ONLY: three new tables, two triggers on existing tables, four functions. No existing column
-- or policy changes. With no business switched on, the triggers do one indexed lookup and nothing else.
--
-- ROLLBACK (loses sync links and settings only; events already in Google stay there):
--   drop trigger if exists pet_bookings_calendar_enqueue on public.pet_bookings;
--   drop trigger if exists pet_boarding_stays_calendar_enqueue on public.pet_boarding_stays;
--   drop function if exists public.pet_calendar_enqueue();
--   drop function if exists public.pet_calendar_queue_resync(uuid);
--   drop function if exists public.pet_save_calendar_connection(boolean, text);
--   drop function if exists public.pet_calendar_resync();
--   drop table if exists public.pet_calendar_outbox;
--   drop table if exists public.pet_calendar_events;
--   drop table if exists public.pet_calendar_connections;

create table public.pet_calendar_connections (
  id uuid primary key default gen_random_uuid(),            -- pet_audit_row needs an id column
  salon_id uuid not null unique references public.salons(id) on delete cascade,
  enabled boolean not null default false,
  calendar_id text check (calendar_id is null or calendar_id ~ '^[A-Za-z0-9._%+@#-]{3,254}$'),
  last_ok_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_calendar_connections_needs_calendar check (not enabled or calendar_id is not null)
);

-- One row per booking / stay that currently has an event in Google.
create table public.pet_calendar_events (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  source_type text not null check (source_type in ('booking', 'stay')),
  source_id uuid not null,
  google_event_id text not null check (char_length(google_event_id) between 5 and 100),
  calendar_id text not null,
  content_hash text not null,
  synced_at timestamptz not null default now(),
  constraint pet_calendar_events_source_uniq unique (salon_id, source_type, source_id)
);

-- Pending work for the edge function. Rows say "this booking/stay changed"; the function always
-- rebuilds the event from the database, so several rows for one source collapse into one update.
create table public.pet_calendar_outbox (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons(id) on delete cascade,
  source_type text not null check (source_type in ('booking', 'stay')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  processed_at timestamptz
);
create index pet_calendar_outbox_pending_idx on public.pet_calendar_outbox (id) where processed_at is null;
create index pet_calendar_outbox_salon_idx on public.pet_calendar_outbox (salon_id, processed_at);

create trigger pet_calendar_connections_touch before update on public.pet_calendar_connections
  for each row execute function public.pet_touch_updated_at();
-- Audit only real changes (switch / calendar), not the status the sync writes after every run.
create trigger pet_calendar_connections_audit_ins after insert or delete on public.pet_calendar_connections
  for each row execute function public.pet_audit_row();
create trigger pet_calendar_connections_audit_upd after update on public.pet_calendar_connections
  for each row when (old.enabled is distinct from new.enabled or old.calendar_id is distinct from new.calendar_id)
  execute function public.pet_audit_row();

-- ---------------------------------------------------------------------------
-- change capture
-- ---------------------------------------------------------------------------

-- argument 0 is 'booking' or 'stay'. SECURITY DEFINER so the outbox (which the app cannot touch) can
-- be written by whoever saves the booking. Does nothing unless this business has sync switched on.
create function public.pet_calendar_enqueue() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon uuid;
  v_id uuid;
begin
  if tg_op = 'DELETE' then v_salon := old.salon_id; v_id := old.id;
  else v_salon := new.salon_id; v_id := new.id; end if;
  if exists (select 1 from public.pet_calendar_connections c where c.salon_id = v_salon and c.enabled) then
    insert into public.pet_calendar_outbox (salon_id, source_type, source_id) values (v_salon, tg_argv[0], v_id);
  end if;
  return null;
end;
$$;

create trigger pet_bookings_calendar_enqueue after insert or update or delete on public.pet_bookings
  for each row execute function public.pet_calendar_enqueue('booking');
create trigger pet_boarding_stays_calendar_enqueue after insert or update or delete on public.pet_boarding_stays
  for each row execute function public.pet_calendar_enqueue('stay');

-- Queue everything upcoming (and everything already linked, so moved/cancelled ones are cleaned up).
create function public.pet_calendar_queue_resync(p_salon uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.pet_calendar_outbox (salon_id, source_type, source_id)
  select b.salon_id, 'booking', b.id from public.pet_bookings b
   where b.salon_id = p_salon and b.ends_at >= now() - interval '1 day'
  union all
  select s.salon_id, 'stay', s.id from public.pet_boarding_stays s
   where s.salon_id = p_salon and s.check_out_on >= current_date - 1
  union all
  select e.salon_id, e.source_type, e.source_id from public.pet_calendar_events e
   where e.salon_id = p_salon;
end;
$$;

-- ---------------------------------------------------------------------------
-- functions the app calls
-- ---------------------------------------------------------------------------

-- Errors: NOT_AUTHENTICATED, INVALID_CALENDAR_ID, CALENDAR_REQUIRED.
-- Switching on, or changing the calendar, queues an initial sync of upcoming items. Switching off only
-- stops future syncing; events already in Google are left alone.
create function public.pet_save_calendar_connection(p_enabled boolean, p_calendar_id text) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_cal text := nullif(btrim(coalesce(p_calendar_id, '')), '');
  v_prev public.pet_calendar_connections;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_cal is not null and v_cal !~ '^[A-Za-z0-9._%+@#-]{3,254}$' then raise exception 'INVALID_CALENDAR_ID'; end if;
  if coalesce(p_enabled, false) and v_cal is null then raise exception 'CALENDAR_REQUIRED'; end if;
  select * into v_prev from public.pet_calendar_connections where salon_id = v_salon;
  insert into public.pet_calendar_connections (salon_id, enabled, calendar_id)
  values (v_salon, coalesce(p_enabled, false), v_cal)
  on conflict (salon_id) do update set
    enabled = excluded.enabled, calendar_id = excluded.calendar_id, last_error = null;
  if coalesce(p_enabled, false)
     and (v_prev.id is null or not v_prev.enabled or v_prev.calendar_id is distinct from v_cal) then
    perform public.pet_calendar_queue_resync(v_salon);
  end if;
end;
$$;

-- Errors: NOT_AUTHENTICATED, NOT_CONNECTED.
create function public.pet_calendar_resync() returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.pet_calendar_connections where salon_id = v_salon and enabled) then
    raise exception 'NOT_CONNECTED';
  end if;
  perform public.pet_calendar_queue_resync(v_salon);
end;
$$;

-- ---------------------------------------------------------------------------
-- access. This project's default privileges give new functions to anon and authenticated, so
-- everything is revoked first and then granted narrowly.
-- ---------------------------------------------------------------------------

alter table public.pet_calendar_connections enable row level security;
alter table public.pet_calendar_events enable row level security;
alter table public.pet_calendar_outbox enable row level security;

create policy "pet_calendar_connections_select_own_salon" on public.pet_calendar_connections for select to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_calendar_connections from anon, authenticated;
revoke all on public.pet_calendar_events from anon, authenticated;
revoke all on public.pet_calendar_outbox from anon, authenticated;
grant select on public.pet_calendar_connections to authenticated;

revoke execute on function public.pet_calendar_enqueue() from public, anon, authenticated;
revoke execute on function public.pet_calendar_queue_resync(uuid) from public, anon, authenticated;
revoke execute on function public.pet_save_calendar_connection(boolean, text) from public, anon;
revoke execute on function public.pet_calendar_resync() from public, anon;
grant execute on function public.pet_save_calendar_connection(boolean, text) to authenticated;
grant execute on function public.pet_calendar_resync() to authenticated;
