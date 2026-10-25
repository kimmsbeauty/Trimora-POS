-- 099_pet_mpesa_stk.sql
--
-- Trimora Pet -- M-Pesa STK Push for invoices (Till / Buy Goods, same Daraja
-- infrastructure Salon and Auto already use).
--
-- STATUS: written for owner review. NOT applied anywhere. Apply by hand in the
-- Supabase SQL Editor only after the owner says "apply 099", BEFORE deploying the
-- updated mpesa-stk-push Edge Function (the function writes the new column).
--
-- WHY: Pet could only record an M-Pesa payment by typing the receipt code. Nothing
-- proved the money arrived. This links a push to an invoice and lets the DATABASE
-- (not the browser) decide whether a payment is confirmed.
--
-- WHAT IT DOES (additive; no existing row or function is changed):
--   1. salon_mpesa_payments.pet_invoice_id (nullable): set by mpesa-stk-push when a
--      push is started for a Pet invoice. Salon and Auto rows leave it NULL.
--   2. pet_mpesa_status(checkout_request_id): scoped to the caller's business. Used for
--      polling, so Pet never has to read salon_mpesa_payments directly.
--   3. pet_record_mpesa_payment(invoice_id, checkout_request_id): records the payment
--      on the invoice ONLY if the push is CONFIRMED by the Daraja callback, belongs to
--      the same business AND to this invoice. The amount and receipt come from the
--      confirmed row, never from the browser. Safe to retry (returns the status again).
--      Reuses the existing unique (business, method, reference) index, so one receipt
--      can never be applied twice.
--   4. pet_mpesa_unrecorded(invoice_id): confirmed pushes for an invoice that were not
--      recorded (browser closed after the customer paid), so staff can record them.
--
-- NOT covered: refunds, and anything about the callback itself (unchanged).
--
-- ROLLBACK (loses only the link; recorded pet_payments rows are untouched):
--   drop function if exists public.pet_mpesa_unrecorded(uuid);
--   drop function if exists public.pet_record_mpesa_payment(uuid, text);
--   drop function if exists public.pet_mpesa_status(text);
--   drop index if exists public.salon_mpesa_payments_pet_invoice_idx;
--   alter table public.salon_mpesa_payments drop column if exists pet_invoice_id;

alter table public.salon_mpesa_payments
  add column if not exists pet_invoice_id uuid references public.pet_invoices(id) on delete set null;

create index if not exists salon_mpesa_payments_pet_invoice_idx
  on public.salon_mpesa_payments (pet_invoice_id) where pet_invoice_id is not null;

-- ---------------------------------------------------------------------------
-- pet_mpesa_status: polling. Only this business's Pet pushes are visible.
-- Returns zero rows for an unknown, foreign or non-Pet push.
-- ---------------------------------------------------------------------------
create or replace function public.pet_mpesa_status(p_checkout_request_id text)
returns table (status text, result_desc text, amount integer, mpesa_receipt text)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query
    select p.status::text, p.result_desc::text, p.amount::integer, p.mpesa_receipt::text
      from public.salon_mpesa_payments p
     where p.checkout_request_id = p_checkout_request_id
       and p.salon_id = v_salon
       and p.pet_invoice_id is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- pet_record_mpesa_payment
-- Errors: NOT_AUTHENTICATED, INVOICE_NOT_FOUND, INVOICE_NOT_PAYABLE,
-- MPESA_PAYMENT_NOT_FOUND, MPESA_PAYMENT_MISMATCH, MPESA_NOT_CONFIRMED,
-- OVERPAYMENT, DUPLICATE_PAYMENT_REFERENCE.
-- Returns the invoice's status.
-- ---------------------------------------------------------------------------
create or replace function public.pet_record_mpesa_payment(p_invoice_id uuid, p_checkout_request_id text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_inv record;
  v_pay record;
  v_paid bigint;
  v_status text;
  v_existing uuid;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select id, status, total into v_inv from public.pet_invoices
   where id = p_invoice_id and salon_id = v_salon for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;

  select * into v_pay from public.salon_mpesa_payments
   where checkout_request_id = p_checkout_request_id and salon_id = v_salon;
  if not found then raise exception 'MPESA_PAYMENT_NOT_FOUND'; end if;
  if v_pay.pet_invoice_id is distinct from p_invoice_id then raise exception 'MPESA_PAYMENT_MISMATCH'; end if;
  if v_pay.status is distinct from 'confirmed' or nullif(btrim(coalesce(v_pay.mpesa_receipt, '')), '') is null then
    raise exception 'MPESA_NOT_CONFIRMED';
  end if;

  -- Retry safety: already recorded on THIS invoice -> report the current status.
  select id into v_existing from public.pet_payments
   where salon_id = v_salon and invoice_id = p_invoice_id and method = 'mpesa'
     and lower(btrim(reference)) = lower(btrim(v_pay.mpesa_receipt));
  if found then
    select status into v_status from public.pet_invoices where id = p_invoice_id;
    return v_status;
  end if;

  if v_inv.status not in ('issued', 'partial') then raise exception 'INVOICE_NOT_PAYABLE'; end if;
  select coalesce(sum(amount), 0) into v_paid from public.pet_payments where invoice_id = p_invoice_id and salon_id = v_salon;
  if v_paid + v_pay.amount > v_inv.total then raise exception 'OVERPAYMENT'; end if;

  insert into public.pet_payments (salon_id, invoice_id, method, amount, reference)
  values (v_salon, p_invoice_id, 'mpesa', v_pay.amount::integer, btrim(v_pay.mpesa_receipt));

  v_paid := v_paid + v_pay.amount;
  v_status := case when v_paid = v_inv.total then 'paid' else 'partial' end;
  update public.pet_invoices
     set status = v_status, amount_paid = v_paid, paid_at = case when v_status = 'paid' then now() else null end
   where id = p_invoice_id and salon_id = v_salon;
  return v_status;
exception
  when unique_violation then
    raise exception 'DUPLICATE_PAYMENT_REFERENCE';
end;
$$;

-- ---------------------------------------------------------------------------
-- pet_mpesa_unrecorded: confirmed pushes for this invoice with no payment row yet.
-- ---------------------------------------------------------------------------
create or replace function public.pet_mpesa_unrecorded(p_invoice_id uuid)
returns table (checkout_request_id text, amount integer, mpesa_receipt text, confirmed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query
    select p.checkout_request_id::text, p.amount::integer, p.mpesa_receipt::text, p.updated_at
      from public.salon_mpesa_payments p
     where p.salon_id = v_salon and p.pet_invoice_id = p_invoice_id
       and p.status = 'confirmed' and nullif(btrim(coalesce(p.mpesa_receipt, '')), '') is not null
       and not exists (select 1 from public.pet_payments x
                        where x.salon_id = v_salon and x.method = 'mpesa'
                          and lower(btrim(x.reference)) = lower(btrim(p.mpesa_receipt)))
     order by p.updated_at;
end;
$$;

revoke execute on function public.pet_mpesa_status(text) from public, anon;
revoke execute on function public.pet_record_mpesa_payment(uuid, text) from public, anon;
revoke execute on function public.pet_mpesa_unrecorded(uuid) from public, anon;
grant execute on function public.pet_mpesa_status(text) to authenticated;
grant execute on function public.pet_record_mpesa_payment(uuid, text) to authenticated;
grant execute on function public.pet_mpesa_unrecorded(uuid) to authenticated;
