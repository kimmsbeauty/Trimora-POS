-- Migration: 017_sales_rep_onboarding_requests.sql
-- Purpose: sales reps (Trimora's own field employees) need to submit a
-- prospective salon's details while on-site, but the salon must not go
-- live until a superadmin reviews and approves it. This inverts the
-- existing invite flow (superadmin approves FIRST, then salon owner
-- self-completes) for this specific path: rep submits a REQUEST first,
-- superadmin approves AFTER, and approval reuses the existing, already-
-- hardened create_invite() RPC rather than building a parallel path to
-- salon creation. Nothing about the existing invite/onboarding flow
-- (010_close_onboarding_bypass.sql) is touched or changed by this.
--
-- Role model: sales reps are a NEW role, distinct from super admin and
-- distinct from salon staff/admin. Same proven pattern as super admin --
-- email/password Supabase Auth, gated on app_metadata.is_sales_rep
-- (never user_metadata, which is self-editable -- see the
-- 2026-07-02/07-05 privilege-escalation fixes for exactly why that
-- distinction matters).

create table if not exists public.salon_onboarding_requests (
  id bigint generated always as identity primary key,
  submitted_by uuid not null references auth.users(id),
  salon_name text not null,
  owner_name text,
  owner_email text,
  owner_phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resulting_invite_token text,
  created_at timestamptz not null default now()
);

alter table public.salon_onboarding_requests enable row level security;

-- Sales reps: can submit their own requests and see only their own --
-- never another rep's submissions, never the full list.
create policy "sales_rep_insert_own"
  on public.salon_onboarding_requests
  for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'is_sales_rep')::boolean, false)
  );

create policy "sales_rep_select_own"
  on public.salon_onboarding_requests
  for select
  to authenticated
  using (
    submitted_by = auth.uid()
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'is_sales_rep')::boolean, false)
  );

-- Superadmin: sees everything, can update status/review fields on any
-- request (approve/reject). Same app_metadata check as every other
-- super-admin-gated policy/function in this codebase.
create policy "super_admin_select_all_requests"
  on public.salon_onboarding_requests
  for select
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false));

create policy "super_admin_update_all_requests"
  on public.salon_onboarding_requests
  for update
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false))
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false));

-- Log approvals/rejections through the existing audit log for
-- consistency with every other super-admin action (log_admin_action is
-- called from the client, matching the existing generate_invite pattern
-- in SuperAdminDashboard.jsx -- no schema change needed here for that).
