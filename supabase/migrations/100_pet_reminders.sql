-- 100_pet_reminders.sql
--
-- Trimora Pet -- manual reminder queue and delivery history (Module C, first slice).
--
-- STATUS: written for owner review. NOT applied anywhere. Apply by hand only
-- after the owner says "apply 100".
--
-- WHAT THIS IS: staff-driven reminders. The app lists what is due (upcoming
-- appointments, vaccinations due, boarding collections, missed appointments,
-- follow-ups), staff open WhatsApp / SMS with a pre-filled message and then
-- record the outcome. NOTHING IS SENT BY THE SERVER. A click-to-chat link cannot
-- confirm delivery, so "sent" means "staff say they sent it".
-- Automated delivery (provider, scheduler, retries by a worker) is a later phase;
-- `delivery` is already on the table so automated rows can be told apart.
--
-- 1. pet_reminders: one row per reminder. Clients can only READ it.
-- 2. pet_queue_reminder(kind, source_id, channel, message): creates (or returns)
--    the reminder for a booking / vaccination / boarding stay. The customer, pet
--    and due-date basis are derived on the server from the source row, never taken
--    from the client. Idempotent via a stable dedupe key:
--        <kind>:<source_id>:<basis>
--    (basis = booking start / vaccination due date / stay check-out date), so a
--    double-click or retry cannot create a duplicate, and a rescheduled booking or
--    a new due date correctly gets a new reminder.
-- 3. pet_set_reminder_status(id, status, error): pending -> sent | failed |
--    cancelled; failed -> pending (retry, at most 3 failures) | cancelled.
--    sent and cancelled are final. Repeating the same status is a no-op.
--
-- CONSENT: follow-up (retention) reminders are marketing and are refused for
-- customers with customers.marketing_opt_out = true. Service reminders
-- (appointment, vaccination, collection, missed appointment) are not marketing
-- and are allowed; the app still shows the opt-out flag to staff.
-- Archived pets (097) cannot be queued.
--
-- ADDITIVE ONLY: one new table, three new functions. Nothing existing changes.
-- Needs 083 (pet_pets, pet_vaccinations), 087 (pet_audit_row), 088/092 (bookings),
-- 089 (stays) and 097 (archiving).
--
-- ROLLBACK (loses reminder history only):
--   drop function if exists public.pet_set_reminder_status(uuid, text, text);
--   drop function if exists public.pet_queue_reminder(text, uuid, text, text);
--   drop table if exists public.pet_reminders;

create table public.pet_reminders (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  pet_id uuid references public.pet_pets(id) on delete cascade,
  kind text not null
    check (kind in ('appointment', 'vaccination', 'boarding_collection', 'missed_appointment', 'followup')),
  source_type text not null check (source_type in ('booking', 'vaccination', 'stay')),
  source_id uuid not null,
  basis text not null check (btrim(basis) <> ''),
  dedupe_key text not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  delivery text not null default 'manual' check (delivery in ('manual', 'automated')),
  message text not null check (btrim(message) <> '' and char_length(message) <= 600),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_reminders_kind_source check (
    (kind in ('appointment', 'missed_appointment', 'followup') and source_type = 'booking')
    or (kind = 'vaccination' and source_type = 'vaccination')
    or (kind = 'boarding_collection' and source_type = 'stay')
  ),
  constraint pet_reminders_sent_has_time check ((status = 'sent') = (sent_at is not null))
);

create unique index pet_reminders_dedupe_uidx on public.pet_reminders (salon_id, dedupe_key);
create index pet_reminders_salon_status_idx on public.pet_reminders (salon_id, status, created_at desc);
create index pet_reminders_customer_idx on public.pet_reminders (salon_id, customer_id);

create trigger pet_reminders_touch_updated_at
  before update on public.pet_reminders
  for each row execute function public.pet_touch_updated_at();
create trigger pet_reminders_audit after insert or update or delete on public.pet_reminders
  for each row execute function public.pet_audit_row();

alter table public.pet_reminders enable row level security;
create policy "pet_reminders_select_own_salon"
  on public.pet_reminders for select to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_reminders from anon, authenticated;
grant select on public.pet_reminders to authenticated;

-- ---------------------------------------------------------------------------
-- pet_queue_reminder
-- Errors: NOT_AUTHENTICATED, INVALID_KIND, INVALID_CHANNEL, MESSAGE_REQUIRED,
-- MESSAGE_TOO_LONG, SOURCE_NOT_FOUND, SOURCE_NOT_ELIGIBLE, PET_ARCHIVED,
-- CUSTOMER_OPTED_OUT, NO_PHONE.
-- ---------------------------------------------------------------------------
create or replace function public.pet_queue_reminder(p_kind text, p_source_id uuid, p_channel text, p_message text)
returns public.pet_reminders
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_msg text := btrim(coalesce(p_message, ''));
  v_source_type text;
  v_customer uuid;
  v_pet uuid;
  v_basis text;
  v_key text;
  v_phone text;
  v_optout boolean;
  v_archived timestamptz;
  v_row public.pet_reminders;
  b record; v record; s record;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_kind is null or p_kind not in ('appointment', 'vaccination', 'boarding_collection', 'missed_appointment', 'followup') then
    raise exception 'INVALID_KIND';
  end if;
  if p_channel is null or p_channel not in ('whatsapp', 'sms', 'email') then raise exception 'INVALID_CHANNEL'; end if;
  if v_msg = '' then raise exception 'MESSAGE_REQUIRED'; end if;
  if char_length(v_msg) > 600 then raise exception 'MESSAGE_TOO_LONG'; end if;

  -- derive customer, pet and the due-date basis from the source row (tenant-checked)
  if p_kind in ('appointment', 'missed_appointment', 'followup') then
    v_source_type := 'booking';
    select id, customer_id, pet_id, starts_at, status into b
      from public.pet_bookings where id = p_source_id and salon_id = v_salon;
    if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
    if not ((p_kind = 'appointment' and b.status = 'booked')
         or (p_kind = 'missed_appointment' and b.status = 'no-show')
         or (p_kind = 'followup' and b.status = 'completed')) then
      raise exception 'SOURCE_NOT_ELIGIBLE';
    end if;
    v_customer := b.customer_id; v_pet := b.pet_id;
    v_basis := to_char(b.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
  elsif p_kind = 'vaccination' then
    v_source_type := 'vaccination';
    select vc.id, vc.pet_id, vc.next_due_on, p.customer_id into v
      from public.pet_vaccinations vc join public.pet_pets p on p.id = vc.pet_id
     where vc.id = p_source_id and vc.salon_id = v_salon and p.salon_id = v_salon;
    if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
    if v.next_due_on is null then raise exception 'SOURCE_NOT_ELIGIBLE'; end if;
    v_customer := v.customer_id; v_pet := v.pet_id; v_basis := v.next_due_on::text;
  else
    v_source_type := 'stay';
    select id, customer_id, pet_id, check_out_on, status into s
      from public.pet_boarding_stays where id = p_source_id and salon_id = v_salon;
    if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
    if s.status <> 'occupied' then raise exception 'SOURCE_NOT_ELIGIBLE'; end if;
    v_customer := s.customer_id; v_pet := s.pet_id; v_basis := s.check_out_on::text;
  end if;

  select archived_at into v_archived from public.pet_pets where id = v_pet and salon_id = v_salon;
  if v_archived is not null then raise exception 'PET_ARCHIVED'; end if;

  select phone, coalesce(marketing_opt_out, false) into v_phone, v_optout
    from public.customers where id = v_customer and salon_id = v_salon;
  if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
  if p_kind = 'followup' and v_optout then raise exception 'CUSTOMER_OPTED_OUT'; end if;
  if p_channel in ('whatsapp', 'sms') and btrim(coalesce(v_phone, '')) = '' then raise exception 'NO_PHONE'; end if;

  v_key := p_kind || ':' || p_source_id::text || ':' || v_basis;

  insert into public.pet_reminders
    (salon_id, customer_id, pet_id, kind, source_type, source_id, basis, dedupe_key, channel, message)
  values
    (v_salon, v_customer, v_pet, p_kind, v_source_type, p_source_id, v_basis, v_key, p_channel, v_msg)
  on conflict (salon_id, dedupe_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- already queued: return it; an open (pending/failed) one may take the edited text/channel
    select * into v_row from public.pet_reminders where salon_id = v_salon and dedupe_key = v_key for update;
    if v_row.status in ('pending', 'failed') and (v_row.message <> v_msg or v_row.channel <> p_channel) then
      update public.pet_reminders set message = v_msg, channel = p_channel where id = v_row.id returning * into v_row;
    end if;
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- pet_set_reminder_status
-- Errors: NOT_AUTHENTICATED, INVALID_STATUS, REMINDER_NOT_FOUND, REMINDER_FINAL,
-- INVALID_TRANSITION, MAX_ATTEMPTS.
-- ---------------------------------------------------------------------------
create or replace function public.pet_set_reminder_status(p_id uuid, p_status text, p_error text default null)
returns public.pet_reminders
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  r public.pet_reminders;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_status is null or p_status not in ('pending', 'sent', 'failed', 'cancelled') then raise exception 'INVALID_STATUS'; end if;
  select * into r from public.pet_reminders where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'REMINDER_NOT_FOUND'; end if;

  if r.status = p_status then return r; end if;                      -- repeating a click is harmless
  if r.status in ('sent', 'cancelled') then raise exception 'REMINDER_FINAL'; end if;

  if r.status = 'pending' and p_status = 'sent' then
    update public.pet_reminders set status = 'sent', sent_at = now(), last_error = null where id = p_id returning * into r;
  elsif r.status = 'pending' and p_status = 'failed' then
    update public.pet_reminders
       set status = 'failed', attempts = attempts + 1, last_error = left(nullif(btrim(coalesce(p_error, '')), ''), 200)
     where id = p_id returning * into r;
  elsif r.status in ('pending', 'failed') and p_status = 'cancelled' then
    update public.pet_reminders set status = 'cancelled' where id = p_id returning * into r;
  elsif r.status = 'failed' and p_status = 'pending' then
    if r.attempts >= 3 then raise exception 'MAX_ATTEMPTS'; end if;
    update public.pet_reminders set status = 'pending' where id = p_id returning * into r;
  else
    raise exception 'INVALID_TRANSITION';
  end if;
  return r;
end;
$$;

revoke execute on function public.pet_queue_reminder(text, uuid, text, text) from public, anon;
revoke execute on function public.pet_set_reminder_status(uuid, text, text) from public, anon;
grant execute on function public.pet_queue_reminder(text, uuid, text, text) to authenticated;
grant execute on function public.pet_set_reminder_status(uuid, text, text) to authenticated;
