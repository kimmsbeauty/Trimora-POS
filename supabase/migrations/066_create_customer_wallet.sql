-- 066_create_customer_wallet.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-14 (20260714211441) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


ALTER TABLE public.customers ADD COLUMN wallet_balance integer NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0);

CREATE TABLE public.customer_wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('topup','spend','credit')),
    change_amount integer NOT NULL,
    balance_after integer NOT NULL CHECK (balance_after >= 0),
    payment_method text,
    reference_type text,
    reference_id uuid,
    created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_wallet_transactions_salon ON public.customer_wallet_transactions(salon_id);
CREATE INDEX idx_customer_wallet_transactions_customer ON public.customer_wallet_transactions(customer_id);

ALTER TABLE public.customer_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_wallet_transactions_select_own_salon ON public.customer_wallet_transactions
    FOR SELECT USING (salon_id = auth_salon_id());
-- No direct INSERT/UPDATE/DELETE policies for authenticated users: all writes
-- must go through apply_wallet_transaction() below, which is the only path
-- that keeps customers.wallet_balance and this ledger from drifting apart.

GRANT SELECT ON public.customer_wallet_transactions TO authenticated;

-- Atomic wallet transaction: locks the customer row so concurrent spends/
-- topups can't race past each other, derives the caller's own salon_id
-- server-side (never trusts a client-passed value), and refuses to let a
-- spend push the balance negative.
CREATE OR REPLACE FUNCTION public.apply_wallet_transaction(
    p_customer_id uuid,
    p_type text,
    p_amount integer,
    p_payment_method text DEFAULT NULL,
    p_reference_type text DEFAULT NULL,
    p_reference_id uuid DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_salon_id uuid;
    v_current_balance integer;
    v_change integer;
    v_new_balance integer;
BEGIN
    v_salon_id := auth_salon_id();
    IF v_salon_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: no salon session';
    END IF;

    IF p_type NOT IN ('topup','spend','credit') THEN
        RAISE EXCEPTION 'Invalid wallet transaction type: %', p_type;
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be greater than zero';
    END IF;

    SELECT wallet_balance INTO v_current_balance
    FROM customers WHERE id = p_customer_id AND salon_id = v_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found for this salon';
    END IF;

    v_change := CASE WHEN p_type = 'spend' THEN -p_amount ELSE p_amount END;
    v_new_balance := v_current_balance + v_change;

    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;

    UPDATE customers SET wallet_balance = v_new_balance WHERE id = p_customer_id;

    INSERT INTO customer_wallet_transactions (
        salon_id, customer_id, type, change_amount, balance_after,
        payment_method, reference_type, reference_id, created_by, notes
    ) VALUES (
        v_salon_id, p_customer_id, p_type, v_change, v_new_balance,
        p_payment_method, p_reference_type, p_reference_id, p_created_by, p_notes
    );

    RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_wallet_transaction(uuid,text,integer,text,text,uuid,uuid,text) TO authenticated;

-- Additive column on auto_jobs so receipts/reports can show a wallet/cash
-- split without touching total_price or the existing discount mechanism
-- (wallet is a payment method, not a discount -- the job's full price is
-- still owed, just partly settled from wallet balance).
ALTER TABLE public.auto_jobs ADD COLUMN wallet_amount_used integer NOT NULL DEFAULT 0 CHECK (wallet_amount_used >= 0);
