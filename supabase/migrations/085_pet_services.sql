-- 085_pet_services.sql
--
-- Trimora Pet -- Phase 4: service catalogue (grooming, boarding rates, add-ons).
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 085".
--
-- ADDITIVE ONLY: one new table, mirroring auto_services (price is whole KES as
-- an integer, like auto_services.price) plus a category, an optional species
-- filter and a name uniqueness rule. Nothing existing is altered.
--
--   category        'Grooming' | 'Boarding' | 'Add-on' (matches the prototype)
--   duration_minutes optional; boarding items are priced per stay unit and may
--                   leave it empty. Not used to schedule anything yet.
--   species         species the service applies to; empty array = all species.
--
-- Prices here are the CATALOGUE price. Invoices (a later phase) must copy the
-- price onto each invoice line so later catalogue edits never change history.
-- No foreign keys point at this table yet, so rows may be deleted freely; once
-- bookings/invoices reference services, prefer deactivating (active = false).
--
-- ROLLBACK (destroys catalogue rows only):
--   drop table if exists public.pet_services;

create table public.pet_services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text,
  category text not null default 'Grooming' check (category in ('Grooming', 'Boarding', 'Add-on')),
  duration_minutes integer check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 1440)),
  price integer not null check (price >= 0 and price <= 10000000),
  species text[] not null default '{}'
    check (species <@ array['Dog', 'Cat', 'Rabbit', 'Other']::text[]),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- the same business cannot have two services with the same name in one category
create unique index pet_services_salon_category_name_uidx
  on public.pet_services (salon_id, category, lower(btrim(name)));
create index pet_services_salon_active_idx on public.pet_services (salon_id, active);

create trigger pet_services_touch_updated_at
  before update on public.pet_services
  for each row execute function public.pet_touch_updated_at();

alter table public.pet_services enable row level security;

create policy "pet_services_select_own_salon"
  on public.pet_services for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "pet_services_insert_own_salon"
  on public.pet_services for insert
  to authenticated
  with check (salon_id = auth_salon_id());

create policy "pet_services_update_own_salon"
  on public.pet_services for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (salon_id = auth_salon_id());

create policy "pet_services_delete_own_salon"
  on public.pet_services for delete
  to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_services from anon;
revoke truncate, references, trigger on public.pet_services from authenticated;
