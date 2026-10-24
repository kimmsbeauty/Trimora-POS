-- 086_pet_roles.sql
--
-- Trimora Pet -- Phase 5: admin-defined staff roles.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 086", and test on a Supabase branch first.
--
-- ADDITIVE ONLY: two new tables. `staff` (including its free-text `role` job
-- title) is not altered. Roles are DATA the business admin manages; nothing is
-- hard-coded. The app offers Owner/Admin, Manager, Groomer and Receptionist only
-- as suggested starting points the admin may add, edit or ignore.
--
--   pet_roles        one row per role a business defines: name, description and a
--                    `permissions` object of boolean flags (keys are defined by
--                    the app; unknown keys are tolerated, non-boolean values are
--                    rejected here).
--   pet_staff_roles  assigns ONE role to a staff member (unique on staff_id).
--
-- IMPORTANT LIMIT (read before relying on this): login is still the shared device
-- PIN session, so the database cannot tell which staff member is acting. These
-- tables RECORD who has which role; they do NOT yet stop a signed-in device from
-- reading any Pet table in its own business. Per-person enforcement needs a
-- separate decision on per-staff identity. Do not store allergy/medical data on
-- the strength of these tables alone.
--
-- Tenant safety (the live `staff` PK is id only, so a plain FK could point at
-- another salon's staff row). pet_staff_roles insert/update policies therefore
-- also check that BOTH the staff row and the role belong to the caller's salon.
--
-- Deleting a role that is still assigned is blocked (NO ACTION, checked at end of
-- statement so a whole-business cascade delete still works). Reassign first.
--
-- Grants: anon revoked entirely; authenticated keeps SELECT/INSERT/UPDATE/DELETE.
--
-- ROLLBACK (destroys role definitions and assignments only):
--   drop table if exists public.pet_staff_roles;
--   drop table if exists public.pet_roles;

create table public.pet_roles (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  description text check (description is null or char_length(description) <= 300),
  permissions jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(permissions) = 'object'
      and not jsonb_path_exists(permissions, '$.* ? (@.type() != "boolean")')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index pet_roles_salon_name_uidx
  on public.pet_roles (salon_id, lower(btrim(name)));

create trigger pet_roles_touch_updated_at
  before update on public.pet_roles
  for each row execute function public.pet_touch_updated_at();

create table public.pet_staff_roles (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  role_id uuid not null references public.pet_roles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one role per staff member
create unique index pet_staff_roles_staff_uidx on public.pet_staff_roles (staff_id);
create index pet_staff_roles_salon_role_idx on public.pet_staff_roles (salon_id, role_id);

create trigger pet_staff_roles_touch_updated_at
  before update on public.pet_staff_roles
  for each row execute function public.pet_touch_updated_at();

alter table public.pet_roles enable row level security;
alter table public.pet_staff_roles enable row level security;

create policy "pet_roles_select_own_salon"
  on public.pet_roles for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "pet_roles_insert_own_salon"
  on public.pet_roles for insert
  to authenticated
  with check (salon_id = auth_salon_id());

create policy "pet_roles_update_own_salon"
  on public.pet_roles for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (salon_id = auth_salon_id());

create policy "pet_roles_delete_own_salon"
  on public.pet_roles for delete
  to authenticated
  using (salon_id = auth_salon_id());

create policy "pet_staff_roles_select_own_salon"
  on public.pet_staff_roles for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "pet_staff_roles_insert_own_salon"
  on public.pet_staff_roles for insert
  to authenticated
  with check (
    salon_id = auth_salon_id()
    and exists (select 1 from public.staff s where s.id = staff_id and s.salon_id = auth_salon_id())
    and exists (select 1 from public.pet_roles r where r.id = role_id and r.salon_id = auth_salon_id())
  );

create policy "pet_staff_roles_update_own_salon"
  on public.pet_staff_roles for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (
    salon_id = auth_salon_id()
    and exists (select 1 from public.staff s where s.id = staff_id and s.salon_id = auth_salon_id())
    and exists (select 1 from public.pet_roles r where r.id = role_id and r.salon_id = auth_salon_id())
  );

create policy "pet_staff_roles_delete_own_salon"
  on public.pet_staff_roles for delete
  to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_roles from anon;
revoke all on public.pet_staff_roles from anon;
revoke truncate, references, trigger on public.pet_roles from authenticated;
revoke truncate, references, trigger on public.pet_staff_roles from authenticated;
