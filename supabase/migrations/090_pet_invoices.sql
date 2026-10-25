-- 090_pet_invoices.sql
--
-- Trimora Pet -- Phase 7: invoices, invoice lines and payments (checkout).
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 090".
--
-- ADDITIVE ONLY: three new tables and three functions. Nothing existing is
-- altered. It READS salon_settings (tax_enabled, tax_rate, next_invoice_number,
-- all added by migrations 068 and 073) and bumps next_invoice_number, exactly as
-- issue_auto_invoice() does for Auto.
--
-- MONEY: whole Kenya shillings stored as integers (same as pet_services.price and
-- Auto). Totals are computed HERE, never trusted from the client.
--
-- TAX: follows the existing receipt convention (migration 068): prices are VAT
-- INCLUSIVE. If the business has tax enabled, tax_amount = total - round(total /
-- (1 + rate/100)); the rate in force at issue time is copied onto the invoice.
--
-- CLIENT ACCESS: read-only. Every write goes through the functions below, so a
-- finalized invoice or a payment can never be edited or deleted from the app.
--
-- WHAT AN INVOICE IS HERE: created already issued (there is no draft stage).
-- Lines come from the service catalogue (Grooming, Boarding rates, Add-ons) with
-- a quantity, e.g. 3 x nightly boarding. Product lines arrive with the supplies
-- phase. The unit price and name are COPIED from the catalogue at issue time.
--
-- STATUSES (stored): issued, partial, paid, void. "Overdue" is NOT stored; the
-- app derives it (issued/partial and due_date in the past).
--
-- SAFETY RULES
--   * Sequential numbers: INV-0001, INV-0002 ... allocated under a row lock on
--     salon_settings, so concurrent checkouts never share a number.
--   * Idempotent create: the client sends a key; a retry or double click returns
--     the same invoice instead of a second one.
--   * One live invoice per booking (a void invoice frees the booking).
--   * Payments: the same (method, reference) can be recorded once per business,
--     so a repeated M-Pesa receipt code can't be counted twice. A payment can
--     never exceed the outstanding balance. amount_paid is re-derived from the
--     payment rows on every change.
--   * Void: only an issued invoice with NO payments, with a written reason.
--     Refunds are not built yet, so a paid invoice cannot be voided.
--
-- NOT in this migration: M-Pesa STK push / callback, refunds, loyalty points,
-- product lines and stock deduction, discounts approval rules.
--
-- ROLLBACK (destroys invoice, line and payment rows; next_invoice_number is not
-- rolled back):
--   drop function if exists public.pet_void_invoice(uuid, text);
--   drop function if exists public.pet_record_payment(uuid, text, integer, text);
--   drop function if exists public.pet_create_invoice(uuid, uuid, uuid, uuid, jsonb, text, numeric, date, text, jsonb);
--   drop table if exists public.pet_payments;
--   drop table if exists public.pet_invoice_lines;
--   drop table if exists public.pet_invoices;

create table public.pet_invoices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  pet_id uuid references public.pet_pets(id) on delete restrict,
  booking_id uuid references public.pet_bookings(id) on delete restrict,
  invoice_number text not null,
  idempotency_key uuid not null,
  status text not null default 'issued' check (status in ('issued', 'partial', 'paid', 'void')),
  subtotal integer not null check (subtotal >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  total integer not null check (total >= 0),
  tax_enabled boolean not null default false,
  tax_rate integer not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount integer not null default 0 check (tax_amount >= 0),
  amount_paid integer not null default 0 check (amount_paid >= 0),
  due_date date,
  notes text,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_invoices_number_uidx unique (salon_id, invoice_number),
  constraint pet_invoices_idempotency_uidx unique (salon_id, idempotency_key),
  constraint pet_invoices_totals_ok check (discount_amount <= subtotal and total = subtotal - discount_amount and amount_paid <= total),
  constraint pet_invoices_status_ok check (
    status = 'void'
    or (status = 'paid' and amount_paid = total)
    or (status = 'issued' and amount_paid = 0)
    or (status = 'partial' and amount_paid > 0 and amount_paid < total)
  ),
  constraint pet_invoices_void_ok check (status <> 'void' or (voided_at is not null and amount_paid = 0 and btrim(coalesce(void_reason, '')) <> ''))
);
create unique index pet_invoices_booking_live_uidx on public.pet_invoices (booking_id)
  where booking_id is not null and status <> 'void';
create index pet_invoices_salon_issued_idx on public.pet_invoices (salon_id, issued_at desc);
create index pet_invoices_customer_idx on public.pet_invoices (customer_id);

create table public.pet_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  invoice_id uuid not null references public.pet_invoices(id) on delete cascade,
  service_id uuid not null references public.pet_services(id) on delete restrict,
  description text not null,
  quantity integer not null check (quantity >= 1 and quantity <= 100),
  unit_price integer not null check (unit_price >= 0),
  line_total integer not null check (line_total = quantity * unit_price),
  created_at timestamptz not null default now()
);
create index pet_invoice_lines_invoice_idx on public.pet_invoice_lines (salon_id, invoice_id);

create table public.pet_payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  invoice_id uuid not null references public.pet_invoices(id) on delete restrict,
  method text not null check (method in ('cash', 'card', 'mpesa', 'other')),
  amount integer not null check (amount > 0),
  reference text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index pet_payments_invoice_idx on public.pet_payments (salon_id, invoice_id);
create unique index pet_payments_reference_uidx on public.pet_payments (salon_id, method, lower(btrim(reference)))
  where reference is not null and btrim(reference) <> '';

create trigger pet_invoices_touch_updated_at
  before update on public.pet_invoices
  for each row execute function public.pet_touch_updated_at();
create trigger pet_invoices_audit after insert or update or delete on public.pet_invoices
  for each row execute function public.pet_audit_row();
create trigger pet_invoice_lines_audit after insert or update or delete on public.pet_invoice_lines
  for each row execute function public.pet_audit_row();
create trigger pet_payments_audit after insert or update or delete on public.pet_payments
  for each row execute function public.pet_audit_row();

alter table public.pet_invoices enable row level security;
alter table public.pet_invoice_lines enable row level security;
alter table public.pet_payments enable row level security;

create policy "pet_invoices_select_own_salon" on public.pet_invoices for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_invoice_lines_select_own_salon" on public.pet_invoice_lines for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_payments_select_own_salon" on public.pet_payments for select to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_invoices from anon;
revoke all on public.pet_invoices from authenticated;
grant select on public.pet_invoices to authenticated;
revoke all on public.pet_invoice_lines from anon;
revoke all on public.pet_invoice_lines from authenticated;
grant select on public.pet_invoice_lines to authenticated;
revoke all on public.pet_payments from anon;
revoke all on public.pet_payments from authenticated;
grant select on public.pet_payments to authenticated;

-- ---------------------------------------------------------------------------
-- pet_create_invoice: invoice + lines + (optional) payments in ONE transaction.
--   p_lines     [{"service_id": "...", "quantity": 2}, ...]  (1 to 40 lines)
--   p_payments  [{"method": "cash", "amount": 1500, "reference": null}, ...]
--   p_discount_type 'amount' (whole KES) or 'percent' (0 to 100)
-- Returns the invoice id (the existing one when the same key is sent again).
-- Errors: NOT_AUTHENTICATED, INVALID_KEY, CUSTOMER_NOT_FOUND, PET_NOT_FOUND,
-- BOOKING_NOT_FOUND, BOOKING_NOT_READY, BOOKING_ALREADY_INVOICED, INVALID_LINES,
-- SERVICE_NOT_FOUND, INVALID_DISCOUNT, AMOUNT_TOO_LARGE, SETTINGS_MISSING,
-- INVALID_PAYMENT, OVERPAYMENT, DUPLICATE_PAYMENT_REFERENCE.
-- ---------------------------------------------------------------------------
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
  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_qty := (v_line ->> 'quantity')::integer;
    exception when others then raise exception 'INVALID_LINES';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 100 then raise exception 'INVALID_LINES'; end if;
    begin
      select s.price into v_svc from public.pet_services s
       where s.id = (v_line ->> 'service_id')::uuid and s.salon_id = v_salon and s.active;
    exception when others then raise exception 'INVALID_LINES';
    end;
    if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
    v_subtotal := v_subtotal + v_qty::bigint * v_svc.price;
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

  -- Second pass: store the lines with the name and price as they are NOW.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'quantity')::integer;
    insert into public.pet_invoice_lines (salon_id, invoice_id, service_id, description, quantity, unit_price, line_total)
    select v_salon, v_id, s.id, s.name, v_qty, s.price, v_qty * s.price
      from public.pet_services s where s.id = (v_line ->> 'service_id')::uuid and s.salon_id = v_salon;
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

-- ---------------------------------------------------------------------------
-- pet_record_payment: add one payment to an issued or partial invoice.
-- Errors: NOT_AUTHENTICATED, INVOICE_NOT_FOUND, INVOICE_NOT_PAYABLE,
-- INVALID_PAYMENT, OVERPAYMENT, DUPLICATE_PAYMENT_REFERENCE.
-- Returns the invoice's new status.
-- ---------------------------------------------------------------------------
create or replace function public.pet_record_payment(
  p_invoice_id uuid,
  p_method text,
  p_amount integer,
  p_reference text default null
) returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_inv record;
  v_paid bigint;
  v_status text;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select id, status, total into v_inv from public.pet_invoices where id = p_invoice_id and salon_id = v_salon for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_inv.status not in ('issued', 'partial') then raise exception 'INVOICE_NOT_PAYABLE'; end if;
  if p_method is null or p_method not in ('cash', 'card', 'mpesa', 'other') or p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_PAYMENT';
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.pet_payments where invoice_id = p_invoice_id and salon_id = v_salon;
  if v_paid + p_amount > v_inv.total then raise exception 'OVERPAYMENT'; end if;

  insert into public.pet_payments (salon_id, invoice_id, method, amount, reference)
  values (v_salon, p_invoice_id, p_method, p_amount, v_ref);

  v_paid := v_paid + p_amount;
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
-- pet_void_invoice: only an issued invoice with no payments, with a reason.
-- Errors: NOT_AUTHENTICATED, INVOICE_NOT_FOUND, INVOICE_NOT_VOIDABLE,
-- INVOICE_HAS_PAYMENTS, REASON_REQUIRED.
-- ---------------------------------------------------------------------------
create or replace function public.pet_void_invoice(p_invoice_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_inv record;
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
  return 'void';
end;
$$;

-- This project's default privileges grant EXECUTE on new functions to anon and
-- authenticated; keep anon out and give the app (authenticated) access only.
revoke execute on function public.pet_create_invoice(uuid, uuid, uuid, uuid, jsonb, text, numeric, date, text, jsonb) from public, anon;
revoke execute on function public.pet_record_payment(uuid, text, integer, text) from public, anon;
revoke execute on function public.pet_void_invoice(uuid, text) from public, anon;
grant execute on function public.pet_create_invoice(uuid, uuid, uuid, uuid, jsonb, text, numeric, date, text, jsonb) to authenticated;
grant execute on function public.pet_record_payment(uuid, text, integer, text) to authenticated;
grant execute on function public.pet_void_invoice(uuid, text) to authenticated;
