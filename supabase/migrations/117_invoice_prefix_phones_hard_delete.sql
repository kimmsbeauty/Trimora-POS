-- 117_invoice_prefix_phones_hard_delete.sql
--
-- Trimora Pet -- three owner requests for the PawPals Kenya invoice:
--   1. Invoice numbers carry the business's own name:  <PREFIX>-INV-0001  (nothing hardcoded).
--   2. Any number of business phone numbers, each with a "show on invoice" switch.
--   3. Permanent delete of an invoice (to clear test invoices), behind the admin PIN.
--
-- STATUS: APPLIED to production 2026-10-30 on the owner's instruction ("apply 117"). Checked first (read-only): the new
-- objects did not exist, the functions it relies on were present, and pet_refunds_immutable matched migration 105.
-- Verified afterwards from the catalog: RLS on salon_phone_numbers, select-only for authenticated, nothing for anon;
-- EXECUTE on the three new functions for authenticated only; existing invoices and payments untouched. Tested before
-- applying on a local Postgres engine (src/pages/pet/migration117.db.test.js, 17 tests).
--
-- 1. INVOICE PREFIX
--   * salon_settings.invoice_prefix (optional, A-Z and 0-9, up to 20). When empty the prefix is derived
--     from the business NAME: upper-cased, everything but letters and digits removed (max 20).
--     "Pawpalske" -> PAWPALSKE. The owner can shorten it in Settings (e.g. PAWPALS).
--   * Numbering stays in the three functions that allocate it (pet_create_invoice, pet_invoice_stay,
--     pet_daycare_checkout). They keep producing 'INV-0001'; a BEFORE INSERT trigger on pet_invoices
--     turns that into '<PREFIX>-INV-0001'. One place, so no function body is copied or re-created.
--   * Existing invoices keep the number they were issued with. If a business has no usable name the
--     number stays plain 'INV-0001'.
--
-- 2. PHONE NUMBERS
--   * New table salon_phone_numbers (no label, no limit). Read-only to the app; the list is replaced
--     atomically by salon_save_phone_numbers(jsonb) so a half-saved list can never happen.
--   * Existing salon_settings.contact_phone (the WhatsApp booking number) is copied in once as a number
--     shown on invoices, so nothing disappears from invoices already in use. contact_phone itself is
--     untouched and keeps driving the booking WhatsApp buttons.
--
-- 3. PERMANENT DELETE
--   * pet_delete_invoice(admin_pin, invoice_id) removes the invoice, its lines, payments, refunds and
--     delivery log. ADMIN PIN REQUIRED (same step-up as refunds). A wrong PIN returns null, no change.
--   * Product lines are put back into stock (reason sale_void) unless the invoice was void or its
--     refund already returned the stock. Loyalty points the invoice earned (net of reversals) are taken
--     back, never below a zero balance. The stock and loyalty LEDGERS are append-only and keep their
--     rows; only the invoice and its payment/refund rows go. The audit log (087) records every row
--     deleted.
--   * When the business has no invoices left, numbering restarts at 0001. Otherwise numbers are never
--     reused, so a gap can't hide a missing invoice.
--   * Not covered: a confirmed M-Pesa push for a deleted invoice stays in salon_mpesa_payments (the
--     link is cleared), so the money is still visible there.
--
-- ROLLBACK (deleted invoices are NOT recoverable from this migration; use a backup):
--   drop function if exists public.pet_delete_invoice(text, uuid);
--   drop function if exists public.salon_save_phone_numbers(jsonb);
--   drop table if exists public.salon_phone_numbers;
--   drop trigger if exists pet_invoices_prefix_number on public.pet_invoices;
--   drop function if exists public.pet_invoices_apply_prefix();
--   drop function if exists public.pet_invoice_prefix(uuid);
--   alter table public.salon_settings drop column if exists invoice_prefix;
--   (restore pet_refunds_immutable() from migration 105)

-- ---------------------------------------------------------------------------
-- 1. Invoice prefix
-- ---------------------------------------------------------------------------
alter table public.salon_settings add column if not exists invoice_prefix text;
alter table public.salon_settings drop constraint if exists salon_settings_invoice_prefix_ok;
alter table public.salon_settings add constraint salon_settings_invoice_prefix_ok
  check (invoice_prefix is null or invoice_prefix ~ '^[A-Z0-9]{1,20}$');

create or replace function public.pet_invoice_prefix(p_salon uuid) returns text
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    (select nullif(ss.invoice_prefix, '') from public.salon_settings ss where ss.salon_id = p_salon),
    (select nullif(left(regexp_replace(upper(coalesce(s.name, '')), '[^A-Z0-9]', '', 'g'), 20), '')
       from public.salons s where s.id = p_salon)
  );
$$;
revoke execute on function public.pet_invoice_prefix(uuid) from public, anon;
grant execute on function public.pet_invoice_prefix(uuid) to authenticated;

create or replace function public.pet_invoices_apply_prefix() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_prefix text;
begin
  if new.invoice_number ~ '^INV-[0-9]+$' then
    v_prefix := public.pet_invoice_prefix(new.salon_id);
    if v_prefix is not null then new.invoice_number := v_prefix || '-' || new.invoice_number; end if;
  end if;
  return new;
end;
$$;
create trigger pet_invoices_prefix_number before insert on public.pet_invoices
  for each row execute function public.pet_invoices_apply_prefix();

-- ---------------------------------------------------------------------------
-- 2. Business phone numbers
-- ---------------------------------------------------------------------------
create table public.salon_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  phone text not null check (char_length(btrim(phone)) between 7 and 20 and phone ~ '^[0-9+() -]+$'),
  show_on_invoice boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index salon_phone_numbers_digits_uidx
  on public.salon_phone_numbers (salon_id, regexp_replace(phone, '[^0-9]', '', 'g'));
create index salon_phone_numbers_salon_idx on public.salon_phone_numbers (salon_id, position);

alter table public.salon_phone_numbers enable row level security;
create policy "salon_phone_numbers_select_own_salon" on public.salon_phone_numbers for select to authenticated
  using (salon_id = auth_salon_id());
revoke all on public.salon_phone_numbers from anon;
revoke all on public.salon_phone_numbers from authenticated;
grant select on public.salon_phone_numbers to authenticated;

-- Replaces the whole list in one transaction.
--   p_phones [{"phone": "0712 345 678", "show_on_invoice": true}, ...]   (any length, up to 100)
-- Errors: NOT_AUTHENTICATED, INVALID_PHONES, INVALID_PHONE, DUPLICATE_PHONE.
create or replace function public.salon_save_phone_numbers(p_phones jsonb) returns integer
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_item jsonb; v_phone text; v_pos integer := 0;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_phones is null or jsonb_typeof(p_phones) <> 'array' or jsonb_array_length(p_phones) > 100 then
    raise exception 'INVALID_PHONES';
  end if;
  delete from public.salon_phone_numbers where salon_id = v_salon;
  for v_item in select * from jsonb_array_elements(p_phones) loop
    v_phone := btrim(coalesce(v_item ->> 'phone', ''));
    if char_length(v_phone) < 7 or char_length(v_phone) > 20 or v_phone !~ '^[0-9+() -]+$'
       or char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 9 then
      raise exception 'INVALID_PHONE';
    end if;
    insert into public.salon_phone_numbers (salon_id, phone, show_on_invoice, position)
    values (v_salon, v_phone, coalesce((v_item ->> 'show_on_invoice')::boolean, true), v_pos);
    v_pos := v_pos + 1;
  end loop;
  return v_pos;
exception when unique_violation then
  raise exception 'DUPLICATE_PHONE';
end;
$$;
revoke execute on function public.salon_save_phone_numbers(jsonb) from public, anon;
grant execute on function public.salon_save_phone_numbers(jsonb) to authenticated;

-- One-time carry-over of the number already on file.
insert into public.salon_phone_numbers (salon_id, phone, show_on_invoice, position)
select ss.salon_id, btrim(ss.contact_phone), true, 0
  from public.salon_settings ss
 where ss.contact_phone is not null
   and char_length(btrim(ss.contact_phone)) between 7 and 20
   and btrim(ss.contact_phone) ~ '^[0-9+() -]+$'
   and char_length(regexp_replace(ss.contact_phone, '[^0-9]', '', 'g')) >= 9
   and exists (select 1 from public.salons s where s.id = ss.salon_id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Permanent delete
-- ---------------------------------------------------------------------------
-- pet_refunds is append-only: its guard refuses a delete made directly. Allow it only while
-- pet_delete_invoice has switched on its transaction-local flag (nothing the app can set).
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

-- Errors (raised BEFORE the PIN is tried): NOT_AUTHENTICATED, INVOICE_NOT_FOUND.
-- Returns true when deleted, NULL when the admin PIN is wrong or locked out (nothing changed).
create or replace function public.pet_delete_invoice(p_admin_pin text, p_invoice_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_inv record;
  v_row record;
  v_restock boolean;
  v_net integer;
  v_balance integer;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select id, customer_id, status into v_inv from public.pet_invoices
   where id = p_invoice_id and salon_id = v_salon for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;

  -- Step-up proof; a wrong PIN RETURNS (never raises) so the lockout counter still counts (see 091 / 102).
  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then
    return null;
  end if;

  perform set_config('app.pet_hard_delete', 'on', true);

  v_restock := v_inv.status <> 'void'
    and not exists (select 1 from public.pet_refunds where invoice_id = p_invoice_id and salon_id = v_salon and stock_returned);
  if v_restock then
    for v_row in select item_id, quantity from public.pet_invoice_lines
                  where invoice_id = p_invoice_id and salon_id = v_salon and item_id is not null loop
      perform public.pet_apply_stock(v_salon, v_row.item_id, v_row.quantity, 'sale_void', 'Invoice deleted', 'invoice', p_invoice_id);
    end loop;
  end if;

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

  -- Nothing left: start numbering again at 0001. Otherwise numbers are never reused.
  if not exists (select 1 from public.pet_invoices where salon_id = v_salon) then
    update public.salon_settings set next_invoice_number = 1 where salon_id = v_salon;
  end if;

  perform set_config('app.pet_hard_delete', 'off', true);
  return true;
end;
$$;
revoke execute on function public.pet_delete_invoice(text, uuid) from public, anon;
grant execute on function public.pet_delete_invoice(text, uuid) to authenticated;
