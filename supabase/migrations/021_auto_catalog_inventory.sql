-- 021_auto_catalog_inventory.sql
--
-- Trimora Auto — Phase 2 (Catalog & Inventory).
--
-- Three net-new tables, none touching any existing table:
--
-- 1. auto_services -- the car-wash service catalog. Deliberately NOT
--    reusing the existing `services` table (see the Trimora Auto
--    architecture plan, Section 6, objection 1): `services.cat` is
--    already a loosely-structured, POS-specific convention with
--    hardcoded frontend dropdowns, and mixing car-wash rows into it
--    risks exactly the kind of inline conditional the Auto hard
--    constraint prohibits the first time a POS report has to decide
--    whether to include Auto rows.
--
-- 2. auto_service_required_stock -- join table mapping a service to the
--    stock items (and quantities) it consumes, e.g. "Full Wash" needs
--    2 units of shampoo + 1 unit of tyre shine. This is what will drive
--    automatic stock deduction once job completion logic exists
--    (Phase 3+). References the existing `stock` table as-is.
--
-- 3. auto_stock_movements -- a real, tenant-scoped inventory ledger,
--    learning directly from the existing `stock_log`/`stock_movements`
--    tables, which have zero salon_id column and are confirmed dead per
--    the 2026-07-07 baseline. Built correctly from creation this time:
--    salon_id on every row, and append-only (select/insert only, no
--    update/delete policies) so it stays a trustworthy audit trail.

-- 1. auto_services
create table public.auto_services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  name text not null,
  description text,
  duration_minutes integer,
  price integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.auto_services enable row level security;

create policy "auto_services_select_own_salon"
  on public.auto_services for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "auto_services_insert_own_salon"
  on public.auto_services for insert
  to authenticated
  with check (salon_id = auth_salon_id());

create policy "auto_services_update_own_salon"
  on public.auto_services for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (salon_id = auth_salon_id());

create policy "auto_services_delete_own_salon"
  on public.auto_services for delete
  to authenticated
  using (salon_id = auth_salon_id());

-- 2. auto_service_required_stock
create table public.auto_service_required_stock (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  auto_service_id uuid not null references public.auto_services(id) on delete cascade,
  stock_id text not null references public.stock(id),
  quantity numeric not null default 1,
  created_at timestamptz not null default now(),
  unique (auto_service_id, stock_id)
);

alter table public.auto_service_required_stock enable row level security;

create policy "auto_service_required_stock_select_own_salon"
  on public.auto_service_required_stock for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "auto_service_required_stock_insert_own_salon"
  on public.auto_service_required_stock for insert
  to authenticated
  with check (salon_id = auth_salon_id());

create policy "auto_service_required_stock_update_own_salon"
  on public.auto_service_required_stock for update
  to authenticated
  using (salon_id = auth_salon_id())
  with check (salon_id = auth_salon_id());

create policy "auto_service_required_stock_delete_own_salon"
  on public.auto_service_required_stock for delete
  to authenticated
  using (salon_id = auth_salon_id());

-- 3. auto_stock_movements -- append-only ledger, no update/delete policy
create table public.auto_stock_movements (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  stock_id text not null references public.stock(id),
  change_qty integer not null,
  reason text not null,
  reference_type text,
  reference_id uuid,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);

alter table public.auto_stock_movements enable row level security;

create policy "auto_stock_movements_select_own_salon"
  on public.auto_stock_movements for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "auto_stock_movements_insert_own_salon"
  on public.auto_stock_movements for insert
  to authenticated
  with check (salon_id = auth_salon_id());
