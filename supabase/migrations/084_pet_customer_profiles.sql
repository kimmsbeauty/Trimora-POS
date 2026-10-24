-- 084_pet_customer_profiles.sql
--
-- Trimora Pet -- Phase 3: extra contact details for a pet owner.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 084".
--
-- ADDITIVE ONLY: one new table. The shared `customers` table is NOT altered, so
-- Salon and Auto are untouched. One optional profile row per customer holds the
-- contact details `customers` has no columns for (email, address, emergency
-- contact, preferred channels, notes). Marketing opt-out stays in
-- customers.marketing_opt_out (not duplicated here).
--
-- Tenant safety: customers' PK is id only, so insert/update policies also check
-- the referenced customer belongs to the caller's salon (same pattern as 083).
--
-- NOT stored here by design: health/medical information.
--
-- ROLLBACK (destroys the profile rows only; customers and pets are untouched):
--   drop table if exists public.pet_customer_profiles;

create table public.pet_customer_profiles (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  email text check (email is null or (btrim(email) <> '' and position('@' in email) > 1)),
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  preferred_channels text[] not null default '{}'
    check (preferred_channels <@ array['sms', 'whatsapp', 'email']::text[]),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- at most one profile per customer
create unique index pet_customer_profiles_customer_uidx
  on public.pet_customer_profiles (salon_id, customer_id);

create trigger pet_customer_profiles_touch_updated_at
  before update on public.pet_customer_profiles
  for each row execute function public.pet_touch_updated_at();

alter table public.pet_customer_profiles enable row level security;

create policy "pet_customer_profiles_select_own_salon"
  on public.pet_customer_profiles for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "pet_customer_profiles_insert_own_salon"
  on public.pet_customer_profiles for insert
  to authenticated
  with check (
    salon_id = auth_salon_id()
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.salon_id = auth_salon_id()
    )
  );

create policy "pet_customer_profiles_update_own_salon"
  on public.pet_customer_profiles for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (
    salon_id = auth_salon_id()
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.salon_id = auth_salon_id()
    )
  );

create policy "pet_customer_profiles_delete_own_salon"
  on public.pet_customer_profiles for delete
  to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_customer_profiles from anon;
revoke truncate, references, trigger on public.pet_customer_profiles from authenticated;
