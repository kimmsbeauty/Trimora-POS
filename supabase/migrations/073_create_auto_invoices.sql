-- 073_create_auto_invoices.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-16 (20260716034159) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


ALTER TABLE public.salon_settings ADD COLUMN next_invoice_number integer NOT NULL DEFAULT 1 CHECK (next_invoice_number > 0);

CREATE TABLE public.auto_invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    invoice_number text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
    notes text,
    due_date date,
    issued_at timestamptz,
    paid_at timestamptz,
    created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (salon_id, invoice_number)
);

CREATE TABLE public.auto_invoice_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.auto_invoices(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.auto_jobs(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_id)
);

CREATE INDEX idx_auto_invoices_salon ON public.auto_invoices(salon_id);
CREATE INDEX idx_auto_invoices_customer ON public.auto_invoices(customer_id);
CREATE INDEX idx_auto_invoice_jobs_invoice ON public.auto_invoice_jobs(invoice_id);

ALTER TABLE public.auto_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_invoice_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY auto_invoices_select_own_salon ON public.auto_invoices
    FOR SELECT USING (salon_id = auth_salon_id());
CREATE POLICY auto_invoices_insert_own_salon ON public.auto_invoices
    FOR INSERT WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_invoices_update_own_salon ON public.auto_invoices
    FOR UPDATE USING (salon_id = auth_salon_id()) WITH CHECK (salon_id = auth_salon_id());
CREATE POLICY auto_invoices_delete_own_salon ON public.auto_invoices
    FOR DELETE USING (salon_id = auth_salon_id());

CREATE POLICY auto_invoice_jobs_select_own_salon ON public.auto_invoice_jobs
    FOR SELECT USING (EXISTS (SELECT 1 FROM auto_invoices i WHERE i.id = invoice_id AND i.salon_id = auth_salon_id()));
CREATE POLICY auto_invoice_jobs_insert_own_salon ON public.auto_invoice_jobs
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM auto_invoices i WHERE i.id = invoice_id AND i.salon_id = auth_salon_id()));
CREATE POLICY auto_invoice_jobs_delete_own_salon ON public.auto_invoice_jobs
    FOR DELETE USING (EXISTS (SELECT 1 FROM auto_invoices i WHERE i.id = invoice_id AND i.salon_id = auth_salon_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_invoices TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.auto_invoice_jobs TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_auto_invoice(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_salon_id uuid;
    v_next integer;
    v_number text;
    v_invoice_salon uuid;
    v_status text;
BEGIN
    v_salon_id := auth_salon_id();
    IF v_salon_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: no salon session';
    END IF;

    SELECT salon_id, status INTO v_invoice_salon, v_status FROM auto_invoices WHERE id = p_invoice_id;
    IF NOT FOUND OR v_invoice_salon != v_salon_id THEN
        RAISE EXCEPTION 'Invoice not found for this salon';
    END IF;
    IF v_status != 'draft' THEN
        RAISE EXCEPTION 'Only a draft invoice can be issued';
    END IF;

    SELECT next_invoice_number INTO v_next FROM salon_settings WHERE salon_id = v_salon_id FOR UPDATE;
    v_number := 'INV-' || lpad(v_next::text, 4, '0');

    UPDATE salon_settings SET next_invoice_number = v_next + 1 WHERE salon_id = v_salon_id;
    UPDATE auto_invoices SET status = 'issued', invoice_number = v_number, issued_at = now() WHERE id = p_invoice_id;

    RETURN v_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_auto_invoice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_auto_invoice_paid(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_salon_id uuid;
    v_invoice_salon uuid;
    v_status text;
BEGIN
    v_salon_id := auth_salon_id();
    IF v_salon_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: no salon session';
    END IF;

    SELECT salon_id, status INTO v_invoice_salon, v_status FROM auto_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND OR v_invoice_salon != v_salon_id THEN
        RAISE EXCEPTION 'Invoice not found for this salon';
    END IF;
    IF v_status != 'issued' THEN
        RAISE EXCEPTION 'Only an issued invoice can be marked paid';
    END IF;

    UPDATE auto_invoices SET status = 'paid', paid_at = now() WHERE id = p_invoice_id;

    UPDATE auto_jobs SET payment_status = 'paid', payment_method = 'Invoice'
    WHERE id IN (SELECT job_id FROM auto_invoice_jobs WHERE invoice_id = p_invoice_id)
    AND salon_id = v_salon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_auto_invoice_paid(uuid) TO authenticated;
