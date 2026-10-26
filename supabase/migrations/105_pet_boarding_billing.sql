-- 105_pet_boarding_billing.sql
--
-- Trimora Pet -- boarding: bill a stay, with the late-collection charge.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply by hand in the Supabase SQL
-- Editor only after the owner says "apply 105". Apply it BEFORE the matching app code is
-- merged (the Boarding screen calls the new functions).
--
-- THE OWNER'S POLICY (decided 2026-10-25)
--   * EARLY check-out: the customer pays the FULL BOOKED stay. Leaving early changes nothing.
--   * LATE collection: each whole day past the planned check-out date is charged as one
--     extra night at the stay's nightly rate.
--   * The system SUGGESTS the charge; staff may REDUCE the late days (0 = waive) and may add a
--     discount before the invoice is created. Staff can never raise the late days above what the
--     dates support.
--
-- WHAT IT DOES (additive: one column, one index, three functions; nothing existing is changed)
--   1. pet_invoices.stay_id (nullable) plus a unique index so one stay can have only ONE live
--      (non-void) invoice. Voiding the invoice frees the stay to be billed again. The foreign key
--      is NO ACTION, not RESTRICT, so deleting a whole business (which cascades to both tables)
--      is not blocked by this link.
--   2. pet_stay_late_days(checked_out_at, check_out_on): whole days between the planned check-out
--      date and the actual one, never negative.
--   3. pet_stay_billing(stay_id): what the screen shows -- nights, late days, rate, totals, and
--      the stay's live invoice if there is one. Works for a checked-in stay (using today) so staff
--      can see the charge before checking out.
--   4. pet_invoice_stay(key, stay_id, late_days, discount_type, discount_value, due_date, notes):
--      creates the invoice for a CHECKED-OUT stay. Price and name come from the rate COPIED onto
--      the stay at booking time, never from the browser or the current catalogue. Same numbering,
--      tax, discount and idempotency rules as pet_create_invoice. No payment is taken here; the
--      invoice is paid from the Invoices screen like any other.
--
-- ASSUMPTION: the business works in East Africa Time. "Today" for a late collection is the date in
-- Africa/Nairobi when the pet was checked out. Stays are tracked by DATE only (no times), so
-- lateness is counted in whole days. If a business ever works in another timezone, add a timezone
-- setting and replace the constant in pet_stay_late_days.
--
-- Errors: NOT_AUTHENTICATED, INVALID_KEY, STAY_NOT_FOUND, STAY_NOT_CHECKED_OUT, STAY_SERVICE_MISSING,
-- STAY_NO_RATE, STAY_ALREADY_INVOICED, INVALID_LATE_DAYS, INVALID_DISCOUNT, AMOUNT_TOO_LARGE,
-- SETTINGS_MISSING.
--
-- NOT covered: invoicing a stay with no rate or whose boarding service was later deleted (invoice it
-- by hand from the Invoices screen), deposits, and any change to how bookings are invoiced.
--
-- ROLLBACK (invoices already created stay as ordinary invoices; only the link is lost):
--   drop function if exists public.pet_invoice_stay(uuid, uuid, integer, text, numeric, date, text);
--   drop function if exists public.pet_stay_billing(uuid);
--   drop function if exists public.pet_stay_late_days(timestamptz, date);
--   drop index if exists public.pet_invoices_stay_live_uidx;
--   alter table public.pet_invoices drop column if exists stay_id;

alter table public.pet_invoices
  add column if not exists stay_id uuid references public.pet_boarding_stays(id);

create unique index if not exists pet_invoices_stay_live_uidx
  on public.pet_invoices (salon_id, stay_id) where stay_id is not null and status <> 'void';

create or replace function public.pet_stay_late_days(p_checked_out_at timestamptz, p_check_out_on date)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_checked_out_at is null or p_check_out_on is null then 0
              else greatest(0, ((p_checked_out_at at time zone 'Africa/Nairobi')::date - p_check_out_on)) end
$$;

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
        on i.salon_id = v_salon and i.stay_id = p_stay_id and i.status <> 'void';
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
  if exists (select 1 from public.pet_invoices where salon_id = v_salon and stay_id = p_stay_id and status <> 'void') then
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

revoke execute on function public.pet_stay_late_days(timestamptz, date) from public, anon;
revoke execute on function public.pet_stay_billing(uuid) from public, anon;
revoke execute on function public.pet_invoice_stay(uuid, uuid, integer, text, numeric, date, text) from public, anon;
grant execute on function public.pet_stay_late_days(timestamptz, date) to authenticated;
grant execute on function public.pet_stay_billing(uuid) to authenticated;
grant execute on function public.pet_invoice_stay(uuid, uuid, integer, text, numeric, date, text) to authenticated;
