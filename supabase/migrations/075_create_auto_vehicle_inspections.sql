-- 075_create_auto_vehicle_inspections.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-16 (20260716040011) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


CREATE TABLE public.auto_vehicle_inspections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.auto_jobs(id) ON DELETE CASCADE,
    vehicle_id uuid NOT NULL REFERENCES public.auto_vehicles(id) ON DELETE CASCADE,
    stage text NOT NULL CHECK (stage IN ('check_in','pickup')),
    markers jsonb NOT NULL DEFAULT '[]'::jsonb,
    notes text,
    created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_id, stage)
);

CREATE INDEX idx_auto_vehicle_inspections_salon ON public.auto_vehicle_inspections(salon_id);
CREATE INDEX idx_auto_vehicle_inspections_job ON public.auto_vehicle_inspections(job_id);
CREATE INDEX idx_auto_vehicle_inspections_vehicle ON public.auto_vehicle_inspections(vehicle_id);

ALTER TABLE public.auto_vehicle_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY auto_vehicle_inspections_select_own_salon ON public.auto_vehicle_inspections
    FOR SELECT USING (salon_id = auth_salon_id());
CREATE POLICY auto_vehicle_inspections_insert_own_salon ON public.auto_vehicle_inspections
    FOR INSERT WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_vehicle_inspections_update_own_salon ON public.auto_vehicle_inspections
    FOR UPDATE USING (salon_id = auth_salon_id()) WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_vehicle_inspections_delete_own_salon ON public.auto_vehicle_inspections
    FOR DELETE USING (salon_id = auth_salon_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_vehicle_inspections TO authenticated;
