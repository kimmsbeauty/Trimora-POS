-- Phase 4: staff assignment & commission.
-- Additive, nullable -- no existing query (POS or Auto) is affected.
-- Applied live via Supabase MCP on 2026-07-09; this file is the exact
-- text that was run, committed in the same session to avoid the
-- repo/live drift discovered earlier on 022_auto_job_queue_bay.sql.

alter table public.auto_jobs
  add column commission integer;
