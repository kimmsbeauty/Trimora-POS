-- 105_pet_refunds.sql
--
-- Trimora Pet -- refunds on paid invoices (the case pet_void_invoice cannot cover: it refuses any
-- invoice that has payments, INVOICE_HAS_PAYMENTS).
--
-- STATUS: APPLIED to production 2026-10-26 on the owner's instruction ("apply 105"). Checked first
-- (read-only): 090, 094, 095, 101 present; the four constraints this replaces had the expected names;
-- no invoices existed. Verified afterwards from the catalog: pet_refund_invoice is SECURITY DEFINER with
-- search_path pinned, EXECUTE for authenticated only; pet_refunds has RLS on, a select-only policy, no
-- write privilege for authenticated, none at all for anon, and the append-only and audit triggers; the
-- status check allows 'refunded'. Tested before applying on a local Postgres copy built from the real
-- 090/094/095/101 migrations (supabase/tests/105_pet_refunds.sql, 51 assertions). NOT exercised end to end
-- against production (no staging project, and no invoices yet).
--
-- WHAT CHANGES
--   * New table pet_refunds: one row per refund, APPEND-ONLY (no update/delete, as pet_payments and
--     the stock ledger), select-only to the app, audited (087 trigger). pet_payments is NOT touched,
--     so every existing receipt (RCT-...) stays exactly as printed.
--   * pet_invoices gets amount_refunded (money paid back so far) and a new status 'refunded'
--     (every shilling paid has been paid back). Constraints are replaced to say so.
--   * New function pet_refund_invoice(admin_pin, idempotency_key, invoice, method, amount, reason,
--     reference, return_stock) -> refund id. ADMIN PIN REQUIRED (same step-up as 091 / 102): money
--     going out must not be possible from a staff-PIN device alone. A wrong PIN returns null and
--     changes nothing; the failed attempt is counted by the existing lockout.
--   * pet_stock_movements allows reason 'sale_refund'; pet_loyalty_ledger allows 'refund_reversal'.
--
-- RULES (all enforced in the function, under a row lock on the invoice)
--   * Only an invoice with payments can be refunded: status 'paid' or 'partial'. Unpaid -> void
--     it instead; void and already-refunded invoices cannot be refunded.
--   * Amount > 0 and never more than amount_paid - amount_refunded (REFUND_EXCEEDS_PAID).
--   * A 'paid' invoice may be refunded in part, several times, until fully refunded; when
--     amount_refunded reaches amount_paid the invoice becomes 'refunded' and is closed.
--   * A 'partial' invoice (customer part-paid) can only be refunded IN FULL, which closes it. A
--     partial refund there would leave the balance owed ambiguous (PARTIAL_INVOICE_FULL_REFUND_ONLY).
--   * Reason is required. The method says how the money went back (cash, card, mpesa, other). A
--     reference (e.g. an M-Pesa reversal code) is optional but cannot be reused for the same method.
--   * return_stock = true puts the invoice's product lines back into stock (reason sale_refund). Only
--     allowed on the refund that completes the invoice (RETURN_STOCK_NEEDS_FULL_REFUND), because
--     partial refunds do not say which items came back. A partial refund never touches stock; use
--     a stock adjustment if goods were returned.
--   * Idempotent: the same key replays the same refund (no second payout, no second restock).
--   * Loyalty: points earned on the invoice are reversed in proportion to what has been paid back
--     (never more than the customer's current balance, so points already spent are not clawed back).
--
-- WHAT THIS DOES NOT DO (honest limits)
--   * It does NOT move money. An M-Pesa/card refund is paid out in the M-Pesa / card system and
--     recorded here afterwards; no Daraja reversal is called.
--   * It does not identify which staff member did it (shared PINs; Phase 7). The admin PIN proves
--     an administrator authorised it. The audit trigger records the row with the existing actor
--     attribution (flagged actor_asserted).
--   * A fully refunded invoice still occupies its booking (pet_invoices_booking_live_uidx only
--     frees a booking on 'void'), so the booking cannot be invoiced again by accident. If you want
--     to re-bill, that is a deliberate follow-up change.
--   * lifetime_earned on the loyalty account is not reduced by a reversal (balance is).
--
-- ROLLBACK (destroys refund rows; only safe before any real refund exists, otherwise export first):
--   drop function if exists public.pet_refund_invoice(text, uuid, uuid, text, integer, text, text, boolean);
--   alter table public.pet_invoices drop constraint pet_invoices_refund_ok;
--   (re-create pet_invoices_status_check / pet_invoices_status_ok exactly as in 090 -- delete or
--    re-status any 'refunded' invoices first)
--   alter table public.pet_invoices drop column amount_refunded;
--   drop table public.pet_refunds;
--   (re-create pet_stock_movements_reason_check and pet_loyalty_ledger_reason_check without the
--    new values -- remove any sale_refund / refund_reversal rows first)

-- ---------------------------------------------------------------------------
-- Invoice columns and constraints
-- ---------------------------------------------------------------------------
alter table public.pet_invoices add column amount_refunded integer not null default 0 check (amount_refunded >= 0);

alter table public.pet_invoices drop constraint pet_invoices_status_check;
alter table public.pet_invoices add constraint pet_invoices_status_check
  check (status in ('issued', 'partial', 'paid', 'void', 'refunded'));

alter table public.pet_invoices drop constraint pet_invoices_status_ok;
alter table public.pet_invoices add constraint pet_invoices_status_ok check (
  status = 'void'
  or (status = 'paid' and amount_paid = total)
  or (status = 'issued' and amount_paid = 0)
  or (status = 'partial' and amount_paid > 0 and amount_paid < total)
  or (status = 'refunded' and amount_paid > 0 and amount_refunded = amount_paid)
);

alter table public.pet_invoices add constraint pet_invoices_refund_ok check (
  amount_refunded <= amount_paid
  and (amount_refunded = 0 or status in ('paid', 'refunded'))
  and (status <> 'paid' or amount_refunded < amount_paid)
);

-- ---------------------------------------------------------------------------
-- pet_refunds: append-only
-- ---------------------------------------------------------------------------
create table public.pet_refunds (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  invoice_id uuid not null references public.pet_invoices(id) on delete restrict,
  idempotency_key uuid not null,
  method text not null check (method in ('cash', 'card', 'mpesa', 'other')),
  amount integer not null check (amount > 0),
  reason text not null check (btrim(reason) <> ''),
  reference text,
  stock_returned boolean not null default false,
  refunded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pet_refunds_idempotency_uidx unique (salon_id, idempotency_key)
);
create index pet_refunds_invoice_idx on public.pet_refunds (salon_id, invoice_id);
create index pet_refunds_salon_date_idx on public.pet_refunds (salon_id, refunded_at desc);
create unique index pet_refunds_reference_uidx on public.pet_refunds (salon_id, method, lower(btrim(reference)))
  where reference is not null and btrim(reference) <> '';

create function public.pet_refunds_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'pet_refunds is append-only';
  end if;
  return old;
end;
$$;
create trigger pet_refunds_no_change before update or delete on public.pet_refunds
  for each row execute function public.pet_refunds_immutable();
create trigger pet_refunds_audit after insert or update or delete on public.pet_refunds
  for each row execute function public.pet_audit_row();

alter table public.pet_refunds enable row level security;
create policy "pet_refunds_select_own_salon" on public.pet_refunds for select to authenticated
  using (salon_id = auth_salon_id());
revoke all on public.pet_refunds from anon;
revoke all on public.pet_refunds from authenticated;
grant select on public.pet_refunds to authenticated;

-- ---------------------------------------------------------------------------
-- New ledger reasons
-- ---------------------------------------------------------------------------
alter table public.pet_stock_movements drop constraint pet_stock_movements_reason_check;
alter table public.pet_stock_movements add constraint pet_stock_movements_reason_check
  check (reason in ('opening', 'purchase', 'sale', 'sale_void', 'sale_refund', 'adjustment', 'damaged', 'expired', 'used'));

alter table public.pet_loyalty_ledger drop constraint pet_loyalty_ledger_reason_check;
alter table public.pet_loyalty_ledger add constraint pet_loyalty_ledger_reason_check
  check (reason in ('earn_invoice', 'visit_bonus', 'redeem', 'redeem_refund', 'adjustment', 'refund_reversal'));

-- ---------------------------------------------------------------------------
-- pet_refund_invoice
-- Errors (all raised BEFORE the PIN is tried, so a bad request never burns an attempt):
--   NOT_AUTHENTICATED, INVALID_KEY, REASON_REQUIRED, INVALID_REFUND, INVOICE_NOT_FOUND,
--   INVOICE_NOT_REFUNDABLE, REFUND_EXCEEDS_PAID, PARTIAL_INVOICE_FULL_REFUND_ONLY,
--   RETURN_STOCK_NEEDS_FULL_REFUND, DUPLICATE_REFUND_REFERENCE, IDEMPOTENCY_CONFLICT.
-- Returns the refund id (the existing one when the same key is sent again), or NULL when the admin
-- PIN is wrong or locked out (nothing changed).
-- ---------------------------------------------------------------------------
create or replace function public.pet_refund_invoice(
  p_admin_pin text,
  p_idempotency_key uuid,
  p_invoice_id uuid,
  p_method text,
  p_amount integer,
  p_reason text,
  p_reference text default null,
  p_return_stock boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
  v_inv record;
  v_existing record;
  v_refundable integer;
  v_new_refunded integer;
  v_has_items boolean;
  v_restock boolean;
  v_id uuid;
  v_row record;
  v_earned integer;
  v_reversed integer;
  v_keep integer;
  v_reverse integer;
  v_balance integer;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_KEY'; end if;
  if v_reason = '' then raise exception 'REASON_REQUIRED'; end if;
  if p_method is null or p_method not in ('cash', 'card', 'mpesa', 'other') or p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_REFUND';
  end if;

  select id, invoice_id, amount, method into v_existing
    from public.pet_refunds where salon_id = v_salon and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.invoice_id = p_invoice_id and v_existing.amount = p_amount and v_existing.method = p_method then
      return v_existing.id;
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  select id, customer_id, status, total, amount_paid, amount_refunded into v_inv
    from public.pet_invoices where id = p_invoice_id and salon_id = v_salon for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_inv.status not in ('paid', 'partial') then raise exception 'INVOICE_NOT_REFUNDABLE'; end if;

  v_refundable := v_inv.amount_paid - v_inv.amount_refunded;
  if p_amount > v_refundable then raise exception 'REFUND_EXCEEDS_PAID'; end if;
  if v_inv.status = 'partial' and p_amount <> v_refundable then raise exception 'PARTIAL_INVOICE_FULL_REFUND_ONLY'; end if;

  v_new_refunded := v_inv.amount_refunded + p_amount;
  select exists (select 1 from public.pet_invoice_lines
                  where invoice_id = p_invoice_id and salon_id = v_salon and item_id is not null) into v_has_items;
  if coalesce(p_return_stock, false) and p_amount <> v_refundable then raise exception 'RETURN_STOCK_NEEDS_FULL_REFUND'; end if;
  v_restock := coalesce(p_return_stock, false) and v_has_items;

  if v_ref is not null and exists (select 1 from public.pet_refunds
                                    where salon_id = v_salon and method = p_method and lower(btrim(reference)) = lower(v_ref)) then
    raise exception 'DUPLICATE_REFUND_REFERENCE';
  end if;

  -- The step-up proof. A wrong PIN RETURNS (never raises): raising would roll back the failed-attempt
  -- row verify_staff_pin just wrote and silently disable the lockout (see 091 / 102).
  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then
    return null;
  end if;

  insert into public.pet_refunds (salon_id, invoice_id, idempotency_key, method, amount, reason, reference, stock_returned)
  values (v_salon, p_invoice_id, p_idempotency_key, p_method, p_amount, v_reason, v_ref, v_restock)
  returning id into v_id;

  update public.pet_invoices
     set amount_refunded = v_new_refunded,
         status = case when v_new_refunded = v_inv.amount_paid then 'refunded' else status end
   where id = p_invoice_id and salon_id = v_salon;

  if v_restock then
    for v_row in select item_id, quantity from public.pet_invoice_lines
                  where invoice_id = p_invoice_id and salon_id = v_salon and item_id is not null loop
      perform public.pet_apply_stock(v_salon, v_row.item_id, v_row.quantity, 'sale_refund', 'Invoice refunded', 'invoice', p_invoice_id);
    end loop;
  end if;

  -- Loyalty: take back points in proportion to what has been paid back, never below zero balance.
  select coalesce(sum(points), 0) into v_earned from public.pet_loyalty_ledger
   where salon_id = v_salon and reason = 'earn_invoice' and reference_id = p_invoice_id;
  if v_earned > 0 and v_inv.amount_paid > 0 then
    select coalesce(-sum(points), 0) into v_reversed from public.pet_loyalty_ledger
     where salon_id = v_salon and reason = 'refund_reversal' and reference_id = p_invoice_id;
    v_keep := ((v_earned::bigint * (v_inv.amount_paid - v_new_refunded)) / v_inv.amount_paid)::integer;
    v_reverse := v_earned - v_keep - v_reversed;
    if v_reverse > 0 then
      select points_balance into v_balance from public.pet_loyalty_accounts
       where salon_id = v_salon and customer_id = v_inv.customer_id;
      v_reverse := least(v_reverse, coalesce(v_balance, 0));
      if v_reverse > 0 then
        perform public.pet_loyalty_apply(v_salon, v_inv.customer_id, -v_reverse, 'refund_reversal', 'Invoice refunded', 'invoice', p_invoice_id);
      end if;
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.pet_refund_invoice(text, uuid, uuid, text, integer, text, text, boolean) from public, anon, authenticated;
grant execute on function public.pet_refund_invoice(text, uuid, uuid, text, integer, text, text, boolean) to authenticated;
