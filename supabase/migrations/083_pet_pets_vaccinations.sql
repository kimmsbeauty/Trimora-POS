-- 083_pet_pets_vaccinations.sql
--
-- Trimora Pet -- Phase 2: pets and vaccination records.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply by hand in the
-- Supabase SQL Editor (see supabase/migrations/README.md) only after the owner
-- says "apply 083".
--
-- ADDITIVE ONLY: two new tables. Nothing existing is altered (no change to
-- customers, salons, staff or any Salon/Auto object).
--
-- 1. pet_pets          -- a pet, owned by a row in the shared `customers` table.
-- 2. pet_vaccinations  -- vaccination records for a pet.
--
-- Tenant safety (the live `customers` PK is id only, so a plain FK could point at
-- another salon's customer). Each insert/update policy therefore also checks that
-- the referenced parent row belongs to the caller's salon:
--   pet_pets.customer_id         -> customers.salon_id = auth_salon_id()
--   pet_vaccinations.pet_id      -> pet_pets.salon_id  = auth_salon_id()
--
-- Grants: new tables get anon/authenticated defaults from Supabase. anon is
-- revoked entirely (no public Pet page exists). authenticated keeps only
-- SELECT/INSERT/UPDATE/DELETE (TRUNCATE/REFERENCES/TRIGGER revoked).
--
-- Deliberately NOT included: allergies / medical-notes fields. Who may see those
-- is the owner's decision and needs admin-defined roles first (later PR).
-- `care_notes` and `grooming_notes` are operational handling notes only.
--
-- ROLLBACK (safe while no real Pet data exists; this destroys Pet data):
--   drop table if exists public.pet_vaccinations;
--   drop table if exists public.pet_pets;
--   drop function if exists public.pet_touch_updated_at();

-- shared updated_at trigger function (explicit search_path)
create or replace function public.pet_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 1. pet_pets
create table public.pet_pets (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  species text not null default 'Dog' check (species in ('Dog', 'Cat', 'Rabbit', 'Other')),
  breed text,
  sex text not null default 'Unknown' check (sex in ('Male', 'Female', 'Unknown')),
  date_of_birth date check (date_of_birth is null or date_of_birth <= current_date),
  color text,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg > 0),
  care_notes text,
  grooming_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- the same owner cannot have two pets with the same name and species
create unique index pet_pets_owner_name_species_uidx
  on public.pet_pets (salon_id, customer_id, lower(btrim(name)), species);
create index pet_pets_salon_customer_idx on public.pet_pets (salon_id, customer_id);
create index pet_pets_salon_name_idx on public.pet_pets (salon_id, lower(name));

create trigger pet_pets_touch_updated_at
  before update on public.pet_pets
  for each row execute function public.pet_touch_updated_at();

alter table public.pet_pets enable row level security;

create policy "pet_pets_select_own_salon"
  on public.pet_pets for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "pet_pets_insert_own_salon"
  on public.pet_pets for insert
  to authenticated
  with check (
    salon_id = auth_salon_id()
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.salon_id = auth_salon_id()
    )
  );

create policy "pet_pets_update_own_salon"
  on public.pet_pets for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (
    salon_id = auth_salon_id()
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.salon_id = auth_salon_id()
    )
  );

create policy "pet_pets_delete_own_salon"
  on public.pet_pets for delete
  to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_pets from anon;
revoke truncate, references, trigger on public.pet_pets from authenticated;

-- 2. pet_vaccinations
create table public.pet_vaccinations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  pet_id uuid not null references public.pet_pets(id) on delete cascade,
  vaccine text not null check (btrim(vaccine) <> ''),
  given_on date not null,
  next_due_on date,
  created_at timestamptz not null default now(),
  check (next_due_on is null or next_due_on >= given_on)
);

create index pet_vaccinations_salon_pet_idx on public.pet_vaccinations (salon_id, pet_id);
create index pet_vaccinations_salon_due_idx on public.pet_vaccinations (salon_id, next_due_on);

alter table public.pet_vaccinations enable row level security;

create policy "pet_vaccinations_select_own_salon"
  on public.pet_vaccinations for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "pet_vaccinations_insert_own_salon"
  on public.pet_vaccinations for insert
  to authenticated
  with check (
    salon_id = auth_salon_id()
    and exists (
      select 1 from public.pet_pets p
      where p.id = pet_id and p.salon_id = auth_salon_id()
    )
  );

create policy "pet_vaccinations_update_own_salon"
  on public.pet_vaccinations for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (
    salon_id = auth_salon_id()
    and exists (
      select 1 from public.pet_pets p
      where p.id = pet_id and p.salon_id = auth_salon_id()
    )
  );

create policy "pet_vaccinations_delete_own_salon"
  on public.pet_vaccinations for delete
  to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_vaccinations from anon;
revoke truncate, references, trigger on public.pet_vaccinations from authenticated;
