-- 020_auto_vehicle_management.sql
--
-- Trimora Auto — Phase 1 (Customer & Vehicle Management).
--
-- 1. customers additive columns (account_type, company_name) -- both
--    nullable, no default change. Existing POS reads/writes are
--    unaffected: nothing in the client selects these by name yet, and
--    existing INSERTs that omit them get NULL.
--
-- 2. auto_vehicles -- net new, tenant-scoped from creation (learning
--    from the salon_service_categories gap: registered in TENANT_TABLES
--    and tenantScoping.test.js in this same commit, not after).
--
-- 3. vehicle_photos -- net new, one-to-many per vehicle (the brief asks
--    for "photos", plural), tenant-scoped from creation.
--
-- 4. 'vehicle-photos' Storage bucket, private. storage.objects already
--    has RLS enabled project-wide with zero existing policies (confirmed
--    live before writing this). The three policies below are scoped to
--    bucket_id = 'vehicle-photos' only -- they cannot affect any other
--    bucket now or when one is added later for a different purpose.

-- 1. Additive columns on customers
alter table public.customers
  add column account_type text,
  add column company_name text;

-- 2. auto_vehicles
create table public.auto_vehicles (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  customer_id uuid not null references public.customers(id) on delete cascade,
  reg_number text not null,
  make text,
  model text,
  year integer,
  color text,
  vehicle_type text,
  notes text,
  created_at timestamptz not null default now(),
  unique (salon_id, reg_number)
);

alter table public.auto_vehicles enable row level security;

create policy "auto_vehicles_select_own_salon"
  on public.auto_vehicles for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "auto_vehicles_insert_own_salon"
  on public.auto_vehicles for insert
  to authenticated
  with check (salon_id = auth_salon_id());

create policy "auto_vehicles_update_own_salon"
  on public.auto_vehicles for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (salon_id = auth_salon_id());

create policy "auto_vehicles_delete_own_salon"
  on public.auto_vehicles for delete
  to authenticated
  using (salon_id = auth_salon_id());

-- 3. vehicle_photos
create table public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  vehicle_id uuid not null references public.auto_vehicles(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);

alter table public.vehicle_photos enable row level security;

create policy "vehicle_photos_select_own_salon"
  on public.vehicle_photos for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "vehicle_photos_insert_own_salon"
  on public.vehicle_photos for insert
  to authenticated
  with check (salon_id = auth_salon_id());

create policy "vehicle_photos_delete_own_salon"
  on public.vehicle_photos for delete
  to authenticated
  using (salon_id = auth_salon_id());

-- 4. Storage bucket for vehicle photos, private, salon-prefixed paths
-- (expected path convention: vehicle-photos/{salon_id}/{vehicle_id}/...)
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', false);

create policy "vehicle_photos_bucket_select_own_salon"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth_salon_id()::text
  );

create policy "vehicle_photos_bucket_insert_own_salon"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth_salon_id()::text
  );

create policy "vehicle_photos_bucket_delete_own_salon"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth_salon_id()::text
  );
