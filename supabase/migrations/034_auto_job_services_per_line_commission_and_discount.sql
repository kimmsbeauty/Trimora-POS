-- Feature-parity item #8 (per-line commission overrides + discount).
-- Additive, nullable throughout -- existing rows and every current
-- query are unaffected until the code that uses these columns ships.
--
-- Per explicit decision: this is a real architecture change, not a
-- small tweak. auto_jobs.assigned_staff_id (Phase 4) remains the
-- required staff-member-in-the-bay assignment and the default/fallback
-- for any service line that doesn't get its own explicit staff_id --
-- same fallback pattern POS's cartMath.js already uses
-- (item.stylist || selStaff). Per-line staff_id/commission_override
-- let different people be credited for different services on the same
-- job, matching POS's multi-stylist cart exactly.
--
-- discount_type/value/amount live on auto_jobs, not per-line, matching
-- reality: POS's own "discount" isn't per-line either -- it's one
-- discount applied to the whole cart's service total (cartMath.js's
-- calculateCartTotals).

alter table public.auto_job_services
  add column staff_id uuid references public.staff(id),
  add column commission_override integer,
  add column commission integer;

alter table public.auto_jobs
  add column discount_type text check (discount_type in ('pct','fixed')),
  add column discount_value integer,
  add column discount_amount integer;
