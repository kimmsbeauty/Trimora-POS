-- 110_pet_refund_followups.sql
--
-- Trimora Pet: follow-ups to refunds (105) and boarding billing (107).
--
-- STATUS: APPLIED to production 2026-10-27 (recorded by Supabase as "110_pet_refund_followups",
-- version 20261027022048). This file was committed afterwards from the statements Supabase recorded;
-- the SQL below the header is byte-for-byte what ran (verified by hash).
--
-- WHAT IT DOES
--   * pet_invoices_booking_live_uidx and pet_invoices_stay_live_uidx now ignore both 'void' and
--     'refunded' invoices, so a booking or boarding stay whose invoice was fully refunded can be
--     invoiced again.
--   * pet_stay_billing and pet_invoice_stay are replaced with versions that use the same
--     "not void / not refunded" rule.
--   * pet_loyalty_apply is replaced: earn/bonus points are only applied once per reference, and the
--     lifetime counters are adjusted on refund_reversal and redeem_refund.
--
-- ROLLBACK: re-run the previous definitions: the two indexes from 090 and 107, pet_stay_billing and
-- pet_invoice_stay from 107, and pet_loyalty_apply from 101.

drop index if exists public.pet_invoices_booking_live_uidx;
create unique index pet_invoices_booking_live_uidx on public.pet_invoices (booking_id)
  where booking_id is not null and status not in ('void', 'refunded');

drop index if exists public.pet_invoices_stay_live_uidx;
create unique index pet_invoices_stay_live_uidx on public.pet_invoices (salon_id, stay_id)
  where stay_id is not null and status not in ('void', 'refunded');

create or replace function public.pet_stay_billing(p_stay_id uuid)
returns table (
  status text, nights integer, late_days integer, nightly_rate integer,
  service_name text, nights_total bigint, late_total bigint, total bigint,
  checked_out_on date, invoice_id uuid, invoice_number text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_s public.pet_boarding_stays%rowtype;
  v_n integer;
  v_late integer;
  v_rate integer;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_s from public.pet_boarding_stays where id = p_stay_id and salon_id = v_salon;
  if not found then raise exception 'STAY_NOT_FOUND'; end if;
  v_n := greatest(1, v_s.check_out_on - v_s.check_in_on);
  v_late := public.pet_stay_late_days(coalesce(v_s.checked_out_at, now()), v_s.check_out_on);
  v_rate := coalesce(v_s.nightly_rate, 0);
  return query
    select v_s.status::text, v_n, v_late, v_rate, v_s.service_name::text,
           v_n::bigint * v_rate, v_late::bigint * v_rate, (v_n + v_late)::bigint * v_rate,
           ((coalesce(v_s.checked_out_at, now())) at time zone 'Africa/Nairobi')::date,
           i.id, i.invoice_number::text
      from (select 1) x
      left join public.pet_invoices i
        on i.salon_id = v_salon and i.stay_id = p_stay_id and i.status not in ('void', 'refunded');
end;
$$;

create or replace function public.pet_invoice_stay(
  p_idempotency_key uuid,
  p_stay_id uuid,
  p_late_days integer default null,
  p_discount_type text default 'amount',
  p_discount_value numeric default 0,
  p_due_date date default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_id uuid;
  v_existing uuid;
  v_s public.pet_boarding_stays%rowtype;
  v_n integer;
  v_late_max integer;
  v_late integer;
  v_subtotal bigint;
  v_discount bigint := 0;
  v_total bigint;
  v_tax_enabled boolean := false;
  v_tax_rate integer := 0;
  v_tax_amount bigint := 0;
  v_next integer;
  v_number text;
  v_left integer;
  v_chunk integer;
  v_constraint text;
  v_note text;
  v_out_date date;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_KEY'; end if;

  select id into v_existing from public.pet_invoices where salon_id = v_salon and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  select * into v_s from public.pet_boarding_stays where id = p_stay_id and salon_id = v_salon for update;
  if not found then raise exception 'STAY_NOT_FOUND'; end if;
  if v_s.status <> 'checked-out' then raise exception 'STAY_NOT_CHECKED_OUT'; end if;
  if v_s.service_id is null then raise exception 'STAY_SERVICE_MISSING'; end if;
  if coalesce(v_s.nightly_rate, 0) <= 0 then raise exception 'STAY_NO_RATE'; end if;
  if exists (select 1 from public.pet_invoices where salon_id = v_salon and stay_id = p_stay_id and status not in ('void', 'refunded')) then
    raise exception 'STAY_ALREADY_INVOICED';
  end if;

  v_n := greatest(1, v_s.check_out_on - v_s.check_in_on);
  v_late_max := public.pet_stay_late_days(v_s.checked_out_at, v_s.check_out_on);
  v_late := coalesce(p_late_days, v_late_max);
  if v_late < 0 or v_late > v_late_max then raise exception 'INVALID_LATE_DAYS'; end if;

  v_subtotal := (v_n + v_late)::bigint * v_s.nightly_rate;
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

  v_out_date := (v_s.checked_out_at at time zone 'Africa/Nairobi')::date;
  v_note := 'Boarding ' || v_s.check_in_on || ' to ' || v_s.check_out_on || ' (' || v_n || case when v_n = 1 then ' night' else ' nights' end
            || '), collected ' || v_out_date
            || case when v_late > 0 then ', ' || v_late || case when v_late = 1 then ' day' else ' days' end || ' late' else '' end
            || case when v_late < v_late_max then ' (late charge reduced from ' || v_late_max || ' day(s))' else '' end;
  v_note := v_note || coalesce(E'\n' || nullif(btrim(coalesce(p_notes, '')), ''), '');

  insert into public.pet_invoices (salon_id, customer_id, pet_id, booking_id, stay_id, invoice_number, idempotency_key, status,
    subtotal, discount_amount, total, tax_enabled, tax_rate, tax_amount, amount_paid, due_date, notes)
  values (v_salon, v_s.customer_id, v_s.pet_id, null, p_stay_id, v_number, p_idempotency_key, 'issued',
    v_subtotal, v_discount, v_total, v_tax_enabled, v_tax_rate, v_tax_amount, 0, p_due_date, v_note)
  returning id into v_id;

  -- Booked nights (a line holds at most 100, so a long stay is split), then late nights.
  v_left := v_n;
  while v_left > 0 loop
    v_chunk := least(100, v_left);
    insert into public.pet_invoice_lines (salon_id, invoice_id, service_id, description, quantity, unit_price, line_total)
    values (v_salon, v_id, v_s.service_id, v_s.service_name, v_chunk, v_s.nightly_rate, v_chunk * v_s.nightly_rate);
    v_left := v_left - v_chunk;
  end loop;
  v_left := v_late;
  while v_left > 0 loop
    v_chunk := least(100, v_left);
    insert into public.pet_invoice_lines (salon_id, invoice_id, service_id, description, quantity, unit_price, line_total)
    values (v_salon, v_id, v_s.service_id, v_s.service_name || ' - late collection', v_chunk, v_s.nightly_rate, v_chunk * v_s.nightly_rate);
    v_left := v_left - v_chunk;
  end loop;

  return v_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pet_invoices_idempotency_uidx' then
      select id into v_existing from public.pet_invoices where salon_id = v_salon and idempotency_key = p_idempotency_key;
      if found then return v_existing; end if;
    end if;
    if v_constraint = 'pet_invoices_stay_live_uidx' then raise exception 'STAY_ALREADY_INVOICED'; end if;
    raise;
end;
$$;

create or replace function public.pet_loyalty_apply(
  p_salon uuid, p_customer uuid, p_points integer, p_reason text, p_note text, p_ref_type text, p_ref_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_acc public.pet_loyalty_accounts%rowtype;
  v_new bigint;
begin
  insert into public.pet_loyalty_accounts (salon_id, customer_id) values (p_salon, p_customer)
    on conflict (salon_id, customer_id) do nothing;
  select * into v_acc from public.pet_loyalty_accounts where salon_id = p_salon and customer_id = p_customer for update;
  if p_reason in ('earn_invoice', 'visit_bonus') and p_ref_id is not null and exists (
       select 1 from public.pet_loyalty_ledger l where l.salon_id = p_salon and l.reason = p_reason and l.reference_id = p_ref_id) then
    return null;
  end if;
  v_new := v_acc.points_balance::bigint + p_points;
  if v_new < 0 then raise exception 'INSUFFICIENT_POINTS'; end if;
  if v_new > 1000000000 then raise exception 'POINTS_TOO_LARGE'; end if;
  update public.pet_loyalty_accounts
     set points_balance = v_new,
         lifetime_earned = case
           when p_reason in ('earn_invoice', 'visit_bonus') then lifetime_earned + p_points
           when p_reason in ('adjustment', 'refund_reversal') then greatest(0, lifetime_earned + p_points)
           else lifetime_earned end,
         lifetime_redeemed = case
           when p_reason = 'redeem' then lifetime_redeemed - p_points
           when p_reason = 'redeem_refund' then greatest(0, lifetime_redeemed - p_points)
           else lifetime_redeemed end
   where id = v_acc.id;
  insert into public.pet_loyalty_ledger (salon_id, customer_id, points, balance_after, reason, note, reference_type, reference_id)
  values (p_salon, p_customer, p_points, v_new, p_reason, nullif(btrim(coalesce(p_note, '')), ''), p_ref_type, p_ref_id);
  return v_new;
end;
$$;
