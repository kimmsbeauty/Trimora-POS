-- 019_auto_module_foundation.sql
--
-- Trimora Auto — Phase 0 (Foundation).
--
-- Two purely additive changes, neither of which alters any existing
-- table's behavior for Trimora POS:
--
-- 1. salons.parent_org_id — nullable, self-referencing FK. Lets multiple
--    salon rows optionally group under one umbrella org for cross-branch
--    reporting later (Trimora Auto architecture plan, decision 7.1).
--    Existing salons get NULL and are completely unaffected; nothing
--    currently reads or writes this column.
--
-- 2. salon_enabled_modules — net new table. Per-tenant feature flag so
--    Auto (and any future industry module) can be enabled/disabled per
--    salon independently of POS, per the Trimora Auto hard constraint
--    that Auto must be deployable/disable-able without affecting POS.
--    Admin-managed only (no client insert/update/delete policy) — same
--    access pattern already used for salon_subscriptions.

-- 1. Additive column on salons
alter table public.salons
  add column parent_org_id uuid references public.salons(id) on delete set null;

-- 2. Net new table
create table public.salon_enabled_modules (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  enabled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (salon_id, module_key)
);

alter table public.salon_enabled_modules enable row level security;

-- Staff can read their own salon's enabled modules (to gate UI/routing).
-- No anon policy (public booking pages never need this) and no
-- insert/update/delete policy for authenticated/anon (module toggling is
-- an admin action, done via service-role, same as salon_subscriptions) --
-- RLS defaults to deny for anything without a matching policy.
create policy "staff can read own salon's enabled modules"
  on public.salon_enabled_modules
  for select
  to authenticated
  using (salon_id = auth_salon_id());
