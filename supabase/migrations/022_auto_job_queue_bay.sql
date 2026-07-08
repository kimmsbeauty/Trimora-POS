-- 022_auto_job_queue_bay.sql
--
-- Trimora Auto — Phase 3 (Job/Ticket/Queue/Bay state machine).
--
-- Per the architecture plan's modeling note: Check-In, Queue, and Bay
-- Management are one underlying job/ticket state machine with resource
-- (bay) assignment, projected into multiple UI views, not three separate
-- data models.
--
-- auto_bays and auto_jobs reference each other (a job has a bay_id, a bay
-- has a current_job_id), so auto_bays.current_job_id is added via a
-- separate ALTER after auto_jobs exists, avoiding a circular FK at
-- creation time.
--
-- auto_job_services deliberately snapshots `price` at the time the line
-- item is added (not a live FK-only reference to auto_services.price),
-- so a later catalog price change never rewrites a historical job's
-- total.
--
-- auto_job_events is the data-logging hook the kickoff brief asked for
-- in place of building AI/TIP now -- append-only (select/insert only),
-- same convention as auto_stock_movements.

-- 1. auto_bays (without current_job_id yet)
create table public.auto_bays (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  label text not null,
  status text not null default 'free',
  created_at timestamptz not null default now()
);

alter table public.auto_bays enable row level security;

create policy "auto_bays_select_own_salon"
  on public.auto_bays for select to authenticated
  using (salon_id = auth_salon_id());
create policy "auto_bays_insert_own_salon"
  on public.auto_bays for insert to authenticated
  with check (salon_id = auth_salon_id());
create policy "auto_bays_update_own_salon"
  on public.auto_bays for update to authenticated
  using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());
create policy "auto_bays_delete_own_salon"
  on public.auto_bays for delete to authenticated
  using (salon_id = auth_salon_id());

-- 2. auto_jobs
create table public.auto_jobs (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid not null references public.auto_vehicles(id),
  status text not null default 'waiting',
  priority text,
  bay_id uuid references public.auto_bays(id),
  assigned_staff_id uuid references public.staff(id),
  eta_minutes integer,
  payment_status text not null default 'unpaid',
  total_price integer,
  notes text,
  checked_in_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.auto_jobs enable row level security;

create policy "auto_jobs_select_own_salon"
  on public.auto_jobs for select to authenticated
  using (salon_id = auth_salon_id());
create policy "auto_jobs_insert_own_salon"
  on public.auto_jobs for insert to authenticated
  with check (salon_id = auth_salon_id());
create policy "auto_jobs_update_own_salon"
  on public.auto_jobs for update to authenticated
  using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());
create policy "auto_jobs_delete_own_salon"
  on public.auto_jobs for delete to authenticated
  using (salon_id = auth_salon_id());

-- 3. Close the loop: bay -> its current job (nullable, set after check-in)
alter table public.auto_bays
  add column current_job_id uuid references public.auto_jobs(id);

-- 4. auto_job_services -- line items, price snapshotted at add-time
create table public.auto_job_services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  job_id uuid not null references public.auto_jobs(id) on delete cascade,
  auto_service_id uuid not null references public.auto_services(id),
  price integer not null,
  created_at timestamptz not null default now()
);

alter table public.auto_job_services enable row level security;

create policy "auto_job_services_select_own_salon"
  on public.auto_job_services for select to authenticated
  using (salon_id = auth_salon_id());
create policy "auto_job_services_insert_own_salon"
  on public.auto_job_services for insert to authenticated
  with check (salon_id = auth_salon_id());
create policy "auto_job_services_update_own_salon"
  on public.auto_job_services for update to authenticated
  using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());
create policy "auto_job_services_delete_own_salon"
  on public.auto_job_services for delete to authenticated
  using (salon_id = auth_salon_id());

-- 5. auto_job_events -- append-only log (the AI/TIP data-logging hook)
create table public.auto_job_events (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  job_id uuid not null references public.auto_jobs(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.auto_job_events enable row level security;

create policy "auto_job_events_select_own_salon"
  on public.auto_job_events for select to authenticated
  using (salon_id = auth_salon_id());
create policy "auto_job_events_insert_own_salon"
  on public.auto_job_events for insert to authenticated
  with check (salon_id = auth_salon_id());
