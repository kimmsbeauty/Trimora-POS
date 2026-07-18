-- 069_add_split_payments_and_refunds.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-15 (20260715050351) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


-- Split payments: optional breakdown of the non-wallet remainder across
-- two methods, e.g. [{"method":"Cash","amount":300},{"method":"Till","amount":200}].
-- payment_method becomes 'Split' when this is populated; NULL otherwise,
-- same as every other job today.
ALTER TABLE public.auto_jobs ADD COLUMN payment_breakdown jsonb;

-- Running total of how much of this job has been refunded so far --
-- lets a job be partially refunded more than once without exceeding
-- what was actually payable.
ALTER TABLE public.auto_jobs ADD COLUMN refunded_amount integer NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0);
ALTER TABLE public.auto_jobs ADD CONSTRAINT auto_jobs_refunded_not_exceeding_payable
    CHECK (refunded_amount <= (total_price - discount_amount));

CREATE TABLE public.auto_refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.auto_jobs(id) ON DELETE CASCADE,
    amount integer NOT NULL CHECK (amount > 0),
    reason text,
    refunded_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auto_refunds_salon ON public.auto_refunds(salon_id);
CREATE INDEX idx_auto_refunds_job ON public.auto_refunds(job_id);

ALTER TABLE public.auto_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY auto_refunds_select_own_salon ON public.auto_refunds
    FOR SELECT USING (salon_id = auth_salon_id());
CREATE POLICY auto_refunds_insert_own_salon ON public.auto_refunds
    FOR INSERT WITH CHECK (salon_id = auth_salon_id());

GRANT SELECT, INSERT ON public.auto_refunds TO authenticated;
