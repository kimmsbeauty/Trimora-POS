-- 116_pet_calendar_daycare.sql
--
-- STATUS: APPLIED to production 2026-10-29 (recorded as `pet_calendar_daycare`), after the updated pet-calendar-sync
-- function (version 5, adds daycare events) was deployed. Deploy the function BEFORE applying this: the one-time
-- catch-up below queues daycare rows, and an older function would silently drop them. Needs 113 and 114.
--
-- Adds daycare visits (pet_daycare_visits) to the Google Calendar sync from 113, next to grooming bookings and
-- boarding stays. ADDITIVE and safe for businesses that have not switched the calendar on:
--   * the change-capture trigger only queues a row when that business has sync enabled (same function as 113);
--   * no existing column, policy or grant changes; the two source_type checks are only widened.
-- Businesses that already have sync on get their current and upcoming daycare visits queued once, below.
--
-- ROLLBACK (in this order):
--   drop trigger if exists pet_daycare_visits_calendar_enqueue on public.pet_daycare_visits;
--   delete from public.pet_calendar_outbox where source_type = 'daycare';
--   delete from public.pet_calendar_events where source_type = 'daycare';
--   alter table public.pet_calendar_events drop constraint pet_calendar_events_source_type_check;
--   alter table public.pet_calendar_events add constraint pet_calendar_events_source_type_check
--     check (source_type in ('booking', 'stay'));
--   alter table public.pet_calendar_outbox drop constraint pet_calendar_outbox_source_type_check;
--   alter table public.pet_calendar_outbox add constraint pet_calendar_outbox_source_type_check
--     check (source_type in ('booking', 'stay'));
--   then re-create public.pet_calendar_queue_resync from migration 113.
--   (Events already on a Google calendar stay there; delete them in Google if wanted.)

alter table public.pet_calendar_events drop constraint pet_calendar_events_source_type_check;
alter table public.pet_calendar_events add constraint pet_calendar_events_source_type_check
  check (source_type in ('booking', 'stay', 'daycare'));

alter table public.pet_calendar_outbox drop constraint pet_calendar_outbox_source_type_check;
alter table public.pet_calendar_outbox add constraint pet_calendar_outbox_source_type_check
  check (source_type in ('booking', 'stay', 'daycare'));

-- Same trigger function as grooming and boarding: queues only when the business has sync switched on.
create trigger pet_daycare_visits_calendar_enqueue after insert or update or delete on public.pet_daycare_visits
  for each row execute function public.pet_calendar_enqueue('daycare');

-- "Sync now" and switching sync on / changing the calendar re-queue everything upcoming, now including daycare.
create or replace function public.pet_calendar_queue_resync(p_salon uuid) returns void
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
  select d.salon_id, 'daycare', d.id from public.pet_daycare_visits d
   where d.salon_id = p_salon and d.scheduled_end >= now() - interval '1 day'
  union all
  select e.salon_id, e.source_type, e.source_id from public.pet_calendar_events e
   where e.salon_id = p_salon;
end;
$$;

-- One-time catch-up for businesses that already have the calendar on.
insert into public.pet_calendar_outbox (salon_id, source_type, source_id)
select d.salon_id, 'daycare', d.id
  from public.pet_daycare_visits d
  join public.pet_calendar_connections c on c.salon_id = d.salon_id and c.enabled
 where d.scheduled_end >= now() - interval '1 day';
