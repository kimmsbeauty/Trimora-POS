-- 064_create_auto_membership_plans_and_customer_memberships.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-14 (20260714004617) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


-- Plan definitions (salon-defined membership offerings)
CREATE TABLE public.auto_membership_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    covered_service_id uuid NOT NULL REFERENCES public.auto_services(id) ON DELETE RESTRICT,
    term_days integer NOT NULL CHECK (term_days > 0),
    price integer NOT NULL CHECK (price >= 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- A customer's purchased membership instance
CREATE TABLE public.customer_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.auto_membership_plans(id) ON DELETE RESTRICT,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    amount_paid integer NOT NULL CHECK (amount_paid >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
    sold_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auto_membership_plans_salon ON public.auto_membership_plans(salon_id);
CREATE INDEX idx_customer_memberships_salon ON public.customer_memberships(salon_id);
CREATE INDEX idx_customer_memberships_customer ON public.customer_memberships(customer_id);
CREATE INDEX idx_customer_memberships_plan ON public.customer_memberships(plan_id);

ALTER TABLE public.auto_membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_memberships ENABLE ROW LEVEL SECURITY;

-- auto_membership_plans: standard tenant-scoped CRUD, matching auto_services pattern
CREATE POLICY auto_membership_plans_select_own_salon ON public.auto_membership_plans
    FOR SELECT USING (salon_id = auth_salon_id());
CREATE POLICY auto_membership_plans_insert_own_salon ON public.auto_membership_plans
    FOR INSERT WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_membership_plans_update_own_salon ON public.auto_membership_plans
    FOR UPDATE USING (salon_id = auth_salon_id()) WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_membership_plans_delete_own_salon ON public.auto_membership_plans
    FOR DELETE USING (salon_id = auth_salon_id());

-- customer_memberships: standard tenant-scoped CRUD, matching customers pattern
CREATE POLICY customer_memberships_select_own_salon ON public.customer_memberships
    FOR SELECT USING (salon_id = auth_salon_id());
CREATE POLICY customer_memberships_insert_own_salon ON public.customer_memberships
    FOR INSERT WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY customer_memberships_update_own_salon ON public.customer_memberships
    FOR UPDATE USING (salon_id = auth_salon_id()) WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY customer_memberships_delete_own_salon ON public.customer_memberships
    FOR DELETE USING (salon_id = auth_salon_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_membership_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_memberships TO authenticated;
