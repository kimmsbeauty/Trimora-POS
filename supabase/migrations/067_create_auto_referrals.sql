-- 067_create_auto_referrals.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-15 (20260715043113) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


ALTER TABLE public.salon_settings ADD COLUMN referral_reward_pct integer NOT NULL DEFAULT 10 CHECK (referral_reward_pct >= 0 AND referral_reward_pct <= 100);

CREATE TABLE public.auto_referrals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    referrer_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    referred_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    reward_pct integer NOT NULL CHECK (reward_pct >= 0 AND reward_pct <= 100),
    referrer_reward_status text NOT NULL DEFAULT 'pending' CHECK (referrer_reward_status IN ('pending','redeemed')),
    referred_reward_status text NOT NULL DEFAULT 'pending' CHECK (referred_reward_status IN ('pending','redeemed')),
    referred_job_id uuid REFERENCES public.auto_jobs(id) ON DELETE SET NULL,
    referrer_job_id uuid REFERENCES public.auto_jobs(id) ON DELETE SET NULL,
    created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (referrer_customer_id != referred_customer_id)
);

CREATE INDEX idx_auto_referrals_salon ON public.auto_referrals(salon_id);
CREATE INDEX idx_auto_referrals_referrer ON public.auto_referrals(referrer_customer_id) WHERE referrer_reward_status = 'pending';
CREATE INDEX idx_auto_referrals_referred_job ON public.auto_referrals(referred_job_id) WHERE referred_reward_status = 'pending';

ALTER TABLE public.auto_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY auto_referrals_select_own_salon ON public.auto_referrals
    FOR SELECT USING (salon_id = auth_salon_id());
CREATE POLICY auto_referrals_insert_own_salon ON public.auto_referrals
    FOR INSERT WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_referrals_update_own_salon ON public.auto_referrals
    FOR UPDATE USING (salon_id = auth_salon_id()) WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_referrals_delete_own_salon ON public.auto_referrals
    FOR DELETE USING (salon_id = auth_salon_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_referrals TO authenticated;
