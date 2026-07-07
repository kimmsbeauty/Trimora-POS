-- 018_salon_service_categories.sql
-- APPLIED to production (ukoccobbjeomjwjcvrma) 2026-07-07.
-- Verified post-apply: all 4 existing salons seeded with exactly 5
-- categories each; pre-existing row counts (salons, services, bookings,
-- sales, customers, staff) confirmed unchanged against the 2026-07-07
-- baseline snapshot before and after.
--
-- Generalizes the hardcoded CATS = ["All","Hair","Nails","Beauty","Spa","Barber"]
-- (src/lib/constants.js) into a per-salon table, so category lists stop
-- being a single global constant and become tenant-configurable --
-- required before Trimora Auto (car wash categories are meaningless
-- for a salon and vice versa) but written narrowly here: this migration
-- only adds the table and seeds existing salons with their CURRENT
-- categories. It does not touch constants.js or the frontend read path
-- -- that's a separate, follow-on change, so this step is purely additive
-- and changes nothing visible until the frontend is switched over.

create table if not exists public.salon_service_categories (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (salon_id, name)
);

alter table public.salon_service_categories enable row level security;

-- Mirrors the exact pattern confirmed live (2026-07-07) on `services`:
-- anon SELECT is unrestricted at the RLS layer (tenant isolation for
-- anonymous reads is enforced entirely by db.js appending salon_id to
-- the request, NOT by RLS) -- see note above the seed step in the
-- baseline doc. Authenticated writes/reads are scoped via auth_salon_id().
--
-- Deliberately following this existing pattern rather than tightening
-- it here: tightening RLS on a new table is fine, but doing it
-- inconsistently with every sibling tenant table would make this table
-- behave differently from `services`/`stock`/`staff` for no reason
-- tied to this migration's actual goal. A separate, explicit decision
-- to tighten anon SELECT RLS across all tenant tables is out of scope
-- here and would need its own regression pass against the public
-- booking page.
create policy "salon_service_categories_anon_select"
  on public.salon_service_categories
  for select
  to anon
  using (true);

create policy "salon_service_categories_select_own_salon"
  on public.salon_service_categories
  for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "salon_service_categories_insert_own_salon"
  on public.salon_service_categories
  for insert
  to authenticated
  with check (salon_id = auth_salon_id());

create policy "salon_service_categories_update_own_salon"
  on public.salon_service_categories
  for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (salon_id = auth_salon_id());

create policy "salon_service_categories_delete_own_salon"
  on public.salon_service_categories
  for delete
  to authenticated
  using (salon_id = auth_salon_id());

-- Seed every EXISTING salon with the current global CATS list, so no
-- salon's visible categories change the moment this table starts being
-- read from. Order matches constants.js's current CATS array (minus
-- "All", which is a UI filter option, not a real category).
insert into public.salon_service_categories (salon_id, name, sort_order)
select s.id, cat.name, cat.sort_order
from public.salons s
cross join (
  values ('Hair', 0), ('Nails', 1), ('Beauty', 2), ('Spa', 3), ('Barber', 4)
) as cat(name, sort_order)
on conflict (salon_id, name) do nothing;
