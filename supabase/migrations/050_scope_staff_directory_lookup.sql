-- Closes the public_staff_directory gap flagged in the 2026-07-16 handover:
-- the view had zero row filtering and granted SELECT to anon/authenticated,
-- so any caller could omit the salon_id filter the app *chooses* to send
-- and dump every staff member (name, role, salon_id) across every tenant.
-- Staff names/roles are meant to be publicly visible per-salon (confirmed
-- with the product owner) -- the gap was the lack of a filter that's
-- actually mandatory, not the public visibility itself.
--
-- Fix: a SECURITY DEFINER function that takes p_salon_id as a required
-- argument, instead of a bare view where scoping was only ever an optional
-- client-supplied query-string filter.

create or replace function public.staff_directory_lookup(p_salon_id uuid)
returns table(id uuid, name text, role text, active boolean, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.id, s.name, s.role, s.active, s.created_at
  from public.staff s
  where s.salon_id = p_salon_id
    and s.active = true
  order by s.created_at asc;
$function$;

revoke all on function public.staff_directory_lookup(uuid) from public;
grant execute on function public.staff_directory_lookup(uuid) to anon, authenticated;

-- Close the old unscoped path. Nothing else in the repo queries this view
-- (confirmed by grep against src/) other than the one call site now moved
-- to the RPC above.
revoke select on public.public_staff_directory from anon, authenticated, public;
