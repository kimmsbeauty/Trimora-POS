-- 095_pet_invoice_products.sql
--
-- Trimora Pet -- Phase 8 (part 2): sell retail products on invoices.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 095", and only AFTER 094 (it needs pet_items and
-- pet_apply_stock).
--
-- WHAT CHANGES
--   * pet_invoice_lines: service_id becomes optional and a new item_id column is
--     added. Every line must have exactly ONE of the two. Existing rows (all
--     services) are unaffected.
--   * pet_create_invoice is REPLACED (same signature, so its grants are kept):
--     a line may now be {"item_id", "quantity"} for an active RETAIL product. The
--     price and name come from pet_items, and the quantity is taken out of stock
--     in the same transaction, under a row lock. Not enough stock raises
--     INSUFFICIENT_STOCK and the whole sale (including its invoice number) is
--     undone. Service lines behave exactly as before.
--   * pet_void_invoice is REPLACED (same signature): voiding an unpaid invoice now
--     puts its product lines back into stock (ledger reason sale_void).
--   * Everything else in 090 (numbering, idempotency, payments, tax, one live
--     invoice per booking) is unchanged.
--
-- ROLLBACK (restores the 090 function bodies; delete any invoice lines that point
-- at products first, because service_id must be set again):
--   1. delete from public.pet_invoice_lines where item_id is not null;
--   2. alter table public.pet_invoice_lines drop constraint pet_invoice_lines_one_source;
--      alter table public.pet_invoice_lines drop column item_id;
--      alter table public.pet_invoice_lines alter column service_id set not null;
--   3. re-run the two function definitions from 090_pet_invoices.sql.

alter table public.pet_invoice_lines alter column service_id drop not null;
alter table public.pet_invoice_lines add column item_id uuid references public.pet_items(id) on delete restrict;
alter table public.pet_invoice_lines add constraint pet_invoice_lines_one_source
  check ((service_id is not null) <> (item_id is not null));

create or replace function public.pet_create_invoice(
  p_idempotency_key uuid,
  p_customer_id uuid,
  p_pet_id uuid,
  p_booking_id uuid,
  p_lines jsonb,
  p_discount_type text default 'amount',
  p_discount_value numeric default 0,
  p_due_date date default null,
  p_notes text default null,
  p_payments jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_id uuid;
  v_existing uuid;
  v_pet uuid := p_pet_id;
  v_booking record;
  v_line jsonb;
  v_pay jsonb;
  v_svc record;
  v_item record;
  v_is_item boolean;
  v_qty integer;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_total bigint;
  v_tax_enabled boolean := false;
  v_tax_rate integer := 0;
  v_tax_amount bigint := 0;
  v_next integer;
  v_number text;
  v_paid bigint := 0;
  v_amount bigint;
  v_method text;
  v_ref text;
  v_status text;
  v_constraint text;
  v_nlines integer;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_KEY'; end if;

  select id into v_existing from public.pet_invoices where salon_id = v_salon and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.salon_id = v_salon) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if p_booking_id is not null then
    select b.id, b.customer_id, b.pet_id, b.status into v_booking
      from public.pet_bookings b where b.id = p_booking_id and b.salon_id = v_salon;
    if not found or v_booking.customer_id <> p_customer_id then raise exception 'BOOKING_NOT_FOUND'; end if;
    if v_booking.status not in ('checked-in', 'in-progress', 'completed') then raise exception 'BOOKING_NOT_READY'; end if;
    v_pet := v_booking.pet_id;
  end if;
  if v_pet is not null and not exists (
       select 1 from public.pet_pets p where p.id = v_pet and p.salon_id = v_salon and p.customer_id = p_customer_id) then
    raise exception 'PET_NOT_FOUND';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'INVALID_LINES'; end if;
  v_nlines := jsonb_array_length(p_lines);
  if v_nlines < 1 or v_nlines > 40 then raise exception 'INVALID_LINES'; end if;

  -- First pass: validate every line and total it from CATALOGUE prices.
  -- A line is either a service {"service_id", "quantity"} or a retail product
  -- {"item_id", "quantity"}; never both, never neither.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_qty := (v_line ->> 'quantity')::integer;
    exception when others then raise exception 'INVALID_LINES';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 100 then raise exception 'INVALID_LINES'; end if;
    v_is_item := (v_line ->> 'item_id') is not null;
    if v_is_item = ((v_line ->> 'service_id') is not null) then raise exception 'INVALID_LINES'; end if;
    if v_is_item then
      begin
        select i.price into v_item from public.pet_items i
         where i.id = (v_line ->> 'item_id')::uuid and i.salon_id = v_salon and i.active and i.kind = 'retail';
      exception when others then raise exception 'INVALID_LINES';
      end;
      if not found then raise exception 'ITEM_NOT_FOUND'; end if;
      v_subtotal := v_subtotal + v_qty::bigint * v_item.price;
    else
      begin
        select s.price into v_svc from public.pet_services s
         where s.id = (v_line ->> 'service_id')::uuid and s.salon_id = v_salon and s.active;
      exception when others then raise exception 'INVALID_LINES';
      end;
      if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
      v_subtotal := v_subtotal + v_qty::bigint * v_svc.price;
    end if;
  end loop;
  if v_subtotal > 1000000000 then raise exception 'AMOUNT_TOO_LARGE'; end if;

  if p_discount_type = 'percent' then
    if p_discount_value is null or p_discount_value < 0 or p_discount_value > 100 then raise exception 'INVALID_DISCOUNT'; end if;
    v_discount := round(v_subtotal * p_discount_value / 100.0);
  elsif p_discount_type = 'amount' then
    if p_discount_value is null or p_discount_value < 0 or p_discount_value <> trunc(p_discount_value) or p_discount_value > v_subtotal then
      raise exception 'INVALID_DISCOUNT';
    end if;
    v_discount := p_discount_value;
  else
    raise exception 'INVALID_DISCOUNT';
  end if;
  v_total := v_subtotal - v_discount;

  select ss.tax_enabled, ss.tax_rate, ss.next_invoice_number into v_tax_enabled, v_tax_rate, v_next
    from public.salon_settings ss where ss.salon_id = v_salon for update;
  if not found then raise exception 'SETTINGS_MISSING'; end if;
  if v_tax_enabled then
    v_tax_amount := v_total - round(v_total / (1 + v_tax_rate / 100.0));
  else
    v_tax_rate := 0;
  end if;

  v_number := 'INV-' || lpad(v_next::text, 4, '0');
  update public.salon_settings set next_invoice_number = v_next + 1 where salon_id = v_salon;

  insert into public.pet_invoices (salon_id, customer_id, pet_id, booking_id, invoice_number, idempotency_key, status,
    subtotal, discount_amount, total, tax_enabled, tax_rate, tax_amount, amount_paid, due_date, notes)
  values (v_salon, p_customer_id, v_pet, p_booking_id, v_number, p_idempotency_key, 'issued',
    v_subtotal, v_discount, v_total, v_tax_enabled, v_tax_rate, v_tax_amount, 0, p_due_date,
    nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  -- Second pass: store the lines with the name and price as they are NOW, and
  -- take product stock out under a row lock (INSUFFICIENT_STOCK undoes everything).
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'quantity')::integer;
    if (v_line ->> 'item_id') is not null then
      insert into public.pet_invoice_lines (salon_id, invoice_id, item_id, description, quantity, unit_price, line_total)
      select v_salon, v_id, i.id, i.name, v_qty, i.price, v_qty * i.price
        from public.pet_items i where i.id = (v_line ->> 'item_id')::uuid and i.salon_id = v_salon;
      perform public.pet_apply_stock(v_salon, (v_line ->> 'item_id')::uuid, -v_qty, 'sale', null, 'invoice', v_id);
    else
      insert into public.pet_invoice_lines (salon_id, invoice_id, service_id, description, quantity, unit_price, line_total)
      select v_salon, v_id, s.id, s.name, v_qty, s.price, v_qty * s.price
        from public.pet_services s where s.id = (v_line ->> 'service_id')::uuid and s.salon_id = v_salon;
    end if;
  end loop;

  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    for v_pay in select * from jsonb_array_elements(p_payments) loop
      v_method := v_pay ->> 'method';
      v_ref := nullif(btrim(coalesce(v_pay ->> 'reference', '')), '');
      begin
        v_amount := (v_pay ->> 'amount')::bigint;
      exception when others then raise exception 'INVALID_PAYMENT';
      end;
      if v_method is null or v_method not in ('cash', 'card', 'mpesa', 'other') or v_amount is null or v_amount <= 0 then
        raise exception 'INVALID_PAYMENT';
      end if;
      if v_paid + v_amount > v_total then raise exception 'OVERPAYMENT'; end if;
      insert into public.pet_payments (salon_id, invoice_id, method, amount, reference)
      values (v_salon, v_id, v_method, v_amount, v_ref);
      v_paid := v_paid + v_amount;
    end loop;
  end if;

  v_status := case when v_paid = v_total then 'paid' when v_paid > 0 then 'partial' else 'issued' end;
  if v_status <> 'issued' then
    update public.pet_invoices
       set status = v_status, amount_paid = v_paid, paid_at = case when v_status = 'paid' then now() else null end
     where id = v_id;
  end if;
  return v_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pet_invoices_idempotency_uidx' then
      select id into v_existing from public.pet_invoices where salon_id = v_salon and idempotency_key = p_idempotency_key;
      if found then return v_existing; end if;
    end if;
    if v_constraint = 'pet_invoices_booking_live_uidx' then raise exception 'BOOKING_ALREADY_INVOICED'; end if;
    if v_constraint = 'pet_payments_reference_uidx' then raise exception 'DUPLICATE_PAYMENT_REFERENCE'; end if;
    raise;
end;
$$;

create or replace function public.pet_void_invoice(p_invoice_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_inv record;
  v_row record;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'REASON_REQUIRED'; end if;
  select id, status, amount_paid into v_inv from public.pet_invoices where id = p_invoice_id and salon_id = v_salon for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_inv.status = 'void' then raise exception 'INVOICE_NOT_VOIDABLE'; end if;
  if v_inv.amount_paid > 0 or exists (select 1 from public.pet_payments where invoice_id = p_invoice_id) then
    raise exception 'INVOICE_HAS_PAYMENTS';
  end if;
  update public.pet_invoices
     set status = 'void', voided_at = now(), void_reason = btrim(p_reason)
   where id = p_invoice_id and salon_id = v_salon;
  -- Product lines go back into stock (one ledger row each, reason sale_void).
  for v_row in select item_id, quantity from public.pet_invoice_lines
                where invoice_id = p_invoice_id and salon_id = v_salon and item_id is not null loop
    perform public.pet_apply_stock(v_salon, v_row.item_id, v_row.quantity, 'sale_void', 'Invoice voided', 'invoice', p_invoice_id);
  end loop;
  return 'void';
end;
$$;
