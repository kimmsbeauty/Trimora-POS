-- 062_auto_job_queue_bay_missing_delete_policies.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-08 (20260708182142) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.

create policy "auto_bays_delete_own_salon"
  on public.auto_bays for delete to authenticated
  using (salon_id = auth_salon_id());

create policy "auto_jobs_delete_own_salon"
  on public.auto_jobs for delete to authenticated
  using (salon_id = auth_salon_id());

create policy "auto_job_services_delete_own_salon"
  on public.auto_job_services for delete to authenticated
  using (salon_id = auth_salon_id());
