-- 119_delete_trial_invoices.sql
--
-- Owner decision (30 Oct 2026): the admin must be able to delete a paid invoice too, because the paid
-- invoices on the system are trial invoices. 118 refused any invoice with a payment, refund or M-Pesa record.
--
-- STATUS: NOT APPLIED. Written for review; apply only after the owner says "apply 119".
--
-- WHAT CHANGES (pet_delete_invoice(text, uuid), same signature; nothing else changes)
--   * An invoice with payments and/or refunds can now be deleted, with the admin PIN (a wrong PIN returns
--     NULL and changes nothing). The screen also makes the admin type the invoice number first.
--   * Nothing is lost silently. The copy kept in pet_deleted_invoices (118) now holds the invoice, its lines,
--     its payments and its refunds, plus the ids of any linked M-Pesa records. The audit log (087) still
--     records the deletes. The invoice number stays reserved for ever (118): numbering never goes back.
--   * Still refused: an invoice whose M-Pesa push is still waiting for the customer (INVOICE_HAS_PENDING_MPESA),
--     because a late confirmation would otherwise credit an invoice that no longer exists. A confirmed or
--     failed M-Pesa record stays in salon_mpesa_payments with its link cleared, so the money still shows there.
--   * Products go back into stock unless the invoice was void or a refund already returned them.
--     Loyalty points the invoice earned (net of reversals) are taken back, never below a zero balance;
--     the stock and loyalty ledgers are append-only and keep their rows.
--   * pet_refunds_immutable() lets a refund be deleted ONLY inside pet_delete_invoice, through a
--     transaction-local switch the app cannot set. A refund still can't be edited or deleted any other way.
--
-- ROLLBACK: re-run the 118 definitions of pet_delete_invoice and pet_refunds_immutable. Invoices already
-- deleted are not restored by that; their copies stay in pet_deleted_invoices.

create or replace function public.pet_refunds_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('app.pet_hard_delete', true) = 'on' then
    return old;
  end if;
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'pet_refunds is append-only';
  end if;
  return old;
end;
$$;

-- Errors (raised BEFORE the PIN is tried): NOT_AUTHENTICATED, INVOICE_NOT_FOUND, INVOICE_HAS_PENDING_MPESA.
-- Returns true when deleted, NULL when the admin PIN is wrong or locked out (nothing changed).
create or replace function public.pet_delete_invoice(p_admin_pin text, p_invoice_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_inv public.pet_invoices%rowtype;
  v_row record;
  v_restock boolean;
  v_lines jsonb;
  v_payments jsonb;
  v_refunds jsonb;
  v_mpesa jsonb;
  v_net integer;
  v_balance integer;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_inv from public.pet_invoices where id = p_invoice_id and salon_id = v_salon for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;

  if exists (select 1 from public.salon_mpesa_payments
              where pet_invoice_id = p_invoice_id and salon_id = v_salon and status = 'pending') then
    raise exception 'INVOICE_HAS_PENDING_MPESA';
  end if;

  -- Step-up proof; a wrong PIN RETURNS (never raises) so the lockout counter still counts (see 091 / 102).
  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then
    return null;
  end if;

  perform set_config('app.pet_hard_delete', 'on', true);

  -- Copy first: everything about the invoice, so the deletion can always be accounted for.
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_lines
    from public.pet_invoice_lines l where l.invoice_id = p_invoice_id and l.salon_id = v_salon;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.paid_at), '[]'::jsonb) into v_payments
    from public.pet_payments p where p.invoice_id = p_invoice_id and p.salon_id = v_salon;
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_refunds
    from public.pet_refunds r where r.invoice_id = p_invoice_id and r.salon_id = v_salon;
  select coalesce(jsonb_agg(m.id), '[]'::jsonb) into v_mpesa
    from public.salon_mpesa_payments m where m.pet_invoice_id = p_invoice_id and m.salon_id = v_salon;
  insert into public.pet_deleted_invoices (salon_id, invoice_id, invoice_number, status, snapshot, deleted_by)
  values (v_salon, v_inv.id, v_inv.invoice_number, v_inv.status,
          to_jsonb(v_inv) || jsonb_build_object('lines', v_lines, 'payments', v_payments, 'refunds', v_refunds, 'mpesa_record_ids', v_mpesa),
          auth.uid());

  -- Products: back into stock unless the invoice was void or a refund already returned them.
  v_restock := v_inv.status <> 'void'
    and not exists (select 1 from public.pet_refunds where invoice_id = p_invoice_id and salon_id = v_salon and stock_returned);
  if v_restock then
    for v_row in select item_id, quantity from public.pet_invoice_lines
                  where invoice_id = p_invoice_id and salon_id = v_salon and item_id is not null loop
      perform public.pet_apply_stock(v_salon, v_row.item_id, v_row.quantity, 'sale_void', 'Invoice deleted', 'invoice', p_invoice_id);
    end loop;
  end if;

  -- Loyalty: take back what this invoice earned (net of reversals), never below a zero balance.
  select coalesce(sum(points), 0) into v_net from public.pet_loyalty_ledger
   where salon_id = v_salon and reference_id = p_invoice_id and reason in ('earn_invoice', 'refund_reversal');
  if v_net > 0 then
    select points_balance into v_balance from public.pet_loyalty_accounts
     where salon_id = v_salon and customer_id = v_inv.customer_id;
    v_net := least(v_net, coalesce(v_balance, 0));
    if v_net > 0 then
      perform public.pet_loyalty_apply(v_salon, v_inv.customer_id, -v_net, 'refund_reversal', 'Invoice deleted', 'invoice', p_invoice_id);
    end if;
  end if;

  delete from public.pet_refunds where invoice_id = p_invoice_id and salon_id = v_salon;
  delete from public.pet_payments where invoice_id = p_invoice_id and salon_id = v_salon;
  delete from public.pet_invoices where id = p_invoice_id and salon_id = v_salon; -- lines + delivery log cascade

  perform set_config('app.pet_hard_delete', 'off', true);
  return true;
end;
$$;
revoke execute on function public.pet_delete_invoice(text, uuid) from public, anon;
grant execute on function public.pet_delete_invoice(text, uuid) to authenticated;
