-- Closes a gap left open on the 2026-07-16 handover's own reasoning
-- ("services/categories don't carry that same risk" as staff_directory
-- did, per BookingPage.jsx's comment at the time) -- disagreed with by
-- the product owner: services_anon_select had qual=true, no salon_id
-- filter at all, so any unauthenticated caller could bypass the app's
-- own client-side salon_id filter entirely and dump every salon's full
-- service catalog and pricing in one PostgREST call. Not a privacy leak
-- in the same sense as staff/bookings data, but a real competitive-
-- intelligence exposure (scraping every salon's price list platform-
-- wide at once), and the identical structural bug already closed twice
-- this session for staff_directory_lookup and
-- claim_booking_payment_status -- inconsistent to leave this one open.
--
-- Only one live anon call site exists (confirmed via grep across src/):
-- BookingPage.jsx's public booking page. POSApp.jsx's read goes through
-- the separate, already-correctly-scoped services_select_own_salon
-- (authenticated, salon_id = auth_salon_id()) policy and is untouched
-- by this migration.
--
-- Same fix pattern as staff_directory_lookup (migration 050): a
-- SECURITY DEFINER function requiring p_salon_id as a mandatory
-- argument, replacing a bare anon-readable policy where scoping was
-- only ever an optional client-supplied query-string filter.

create or replace function public.public_services_lookup(p_salon_id uuid)
returns table(id uuid, name text, cat text, price integer, active boolean, created_at timestamp)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.id, s.name, s.cat, s.price, s.active, s.created_at
  from public.services s
  where s.salon_id = p_salon_id
    and s.active = true
  order by s.cat asc, s.name asc;
$function$;

revoke all on function public.public_services_lookup(uuid) from public;
grant execute on function public.public_services_lookup(uuid) to anon, authenticated;

-- Close the old unscoped path. The authenticated, own-salon-scoped
-- policy (services_select_own_salon) is untouched -- POSApp.jsx keeps
-- working exactly as before.
drop policy if exists services_anon_select on public.services;

-- Same exact gap, same table family (BookingPage.jsx's category
-- dropdown), found while fixing the services one above --
-- salon_service_categories_anon_select also had qual=true, no salon_id
-- scoping. Same fix.

create or replace function public.public_service_categories_lookup(p_salon_id uuid)
returns table(id uuid, name text, sort_order integer, active boolean, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.id, c.name, c.sort_order, c.active, c.created_at
  from public.salon_service_categories c
  where c.salon_id = p_salon_id
    and c.active = true
  order by c.sort_order asc;
$function$;

revoke all on function public.public_service_categories_lookup(uuid) from public;
grant execute on function public.public_service_categories_lookup(uuid) to anon, authenticated;

drop policy if exists salon_service_categories_anon_select on public.salon_service_categories;
