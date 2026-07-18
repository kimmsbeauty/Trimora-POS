-- 071_create_auto_coupons.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-15 (20260715103522) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


CREATE TABLE public.auto_coupons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    code text NOT NULL,
    discount_pct integer NOT NULL CHECK (discount_pct > 0 AND discount_pct <= 100),
    expires_at timestamptz,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (salon_id, code)
);

CREATE INDEX idx_auto_coupons_salon ON public.auto_coupons(salon_id);

ALTER TABLE public.auto_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY auto_coupons_select_own_salon ON public.auto_coupons
    FOR SELECT USING (salon_id = auth_salon_id());
CREATE POLICY auto_coupons_insert_own_salon ON public.auto_coupons
    FOR INSERT WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_coupons_update_own_salon ON public.auto_coupons
    FOR UPDATE USING (salon_id = auth_salon_id()) WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_coupons_delete_own_salon ON public.auto_coupons
    FOR DELETE USING (salon_id = auth_salon_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_coupons TO authenticated;
