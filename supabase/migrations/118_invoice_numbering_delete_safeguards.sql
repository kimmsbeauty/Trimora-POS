-- 118_invoice_numbering_delete_safeguards.sql
--
-- Follow-up to 117 (already applied to production), bringing it in line with the owner's final decisions.
-- Nothing here is business-specific: every value comes from the business's own settings or name.
--
-- STATUS: NOT APPLIED. Written for review; apply only after the owner says "apply 118".
--
-- WHAT CHANGES
--   1. Business details on the invoice come from Settings: salon_settings.contact_email, website, address
--      (all optional). Until a business fills them in, the built-in preset values (if any) still show.
--   2. Invoice prefix = the first meaningful word of the business name (upper case, letters and digits,
--      up to 20): "PawPals KE" -> PAWPALS, "Kimms Beauty Parlour" -> KIMMS. Skipped as not meaningful:
--      THE, AN, AND, OF and one-letter words. Order of precedence: salon_settings.invoice_prefix (the
--      owner's own choice) > first word of the name > first word of the web address slug > BIZ.
--   3. Numbers are allocated from pet_invoice_sequences, one counter per business AND prefix, starting at
--      0001 and only ever going up. 117 took the digits from the old shared counter (which sits at 3 for a
--      business that already has two old invoices) and reset it to 1 when the last invoice was deleted,
--      which could hand out a number that had been used before. Both are fixed here. Old numbers such as
--      INV-0002 are left exactly as they are. Four digits is a minimum width, never a limit: 10000 stays
--      10000. A number is also checked against every existing and every deleted invoice before it is used.
--   4. pet_delete_invoice now REFUSES an invoice that has payments, refunds or an M-Pesa record
--      (INVOICE_HAS_PAYMENTS, INVOICE_HAS_REFUNDS, INVOICE_HAS_MPESA). 117 erased them. Such invoices are
--      handled by refund or void so the money trail stays complete. For an eligible invoice the admin PIN is
--      still required; products go back into stock; a full copy of the invoice and its lines is written to
--      pet_deleted_invoices (the audit log only keeps column names, never values) and its number stays
--      reserved forever.
--   5. salon_save_phone_numbers now needs the admin PIN (like refunds and deletes) and has no cap on the
--      number of contacts. The old one-argument version is dropped.
--   6. pet_refunds_immutable() goes back to the 105 version: nothing deletes a refund any more.
--
-- ROLLBACK (the tables only ever hold new data; drop them after copying anything you want to keep):
--   drop function if exists public.pet_delete_invoice(text, uuid);          -- then re-run the 117 definition
--   drop function if exists public.salon_save_phone_numbers(text, jsonb);   -- then re-run the 117 definition
--   drop function if exists public.pet_allocate_invoice_number(uuid, text);
--   drop table if exists public.pet_invoice_sequences;
--   drop table if exists public.pet_deleted_invoices;
--   drop function if exists public.pet_prefix_word(text);
--   alter table public.salon_settings drop column if exists contact_email, drop column if exists website,
--     drop column if exists address;

-- ---------------------------------------------------------------------------
-- 1. Business details
-- ---------------------------------------------------------------------------
alter table public.salon_settings
  add column if not exists contact_email text,
  add column if not exists website text,
  add column if not exists address text;
alter table public.salon_settings drop constraint if exists salon_settings_contact_email_len;
alter table public.salon_settings add constraint salon_settings_contact_email_len
  check (contact_email is null or char_length(contact_email) <= 254);
alter table public.salon_settings drop constraint if exists salon_settings_website_len;
alter table public.salon_settings add constraint salon_settings_website_len
  check (website is null or char_length(website) <= 200);
alter table public.salon_settings drop constraint if exists salon_settings_address_len;
alter table public.salon_settings add constraint salon_settings_address_len
  check (address is null or char_length(address) <= 300);

-- ---------------------------------------------------------------------------
-- 2. Prefix: first meaningful word
-- ---------------------------------------------------------------------------
create or replace function public.pet_prefix_word(p_text text) returns text
language sql immutable set search_path = public, pg_temp
as $$
  with toks as (
    select upper(regexp_replace(t.w, '[^A-Za-z0-9]', '', 'g')) as w, t.ord
      from regexp_split_to_table(coalesce(p_text, ''), '[[:space:]_-]+') with ordinality as t(w, ord)
  ), clean as (select w, ord from toks where w <> '')
  select left(coalesce(
    (select w from clean where char_length(w) >= 2 and w not in ('THE', 'AN', 'AND', 'OF') order by ord limit 1),
    (select w from clean order by ord limit 1)
  ), 20);
$$;
revoke execute on function public.pet_prefix_word(text) from public, anon;
grant execute on function public.pet_prefix_word(text) to authenticated;

create or replace function public.pet_invoice_prefix(p_salon uuid) returns text
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    (select nullif(ss.invoice_prefix, '') from public.salon_settings ss where ss.salon_id = p_salon),
    (select public.pet_prefix_word(s.name) from public.salons s where s.id = p_salon),
    (select public.pet_prefix_word(s.slug) from public.salons s where s.id = p_salon),
    'BIZ'
  );
$$;
revoke execute on function public.pet_invoice_prefix(uuid) from public, anon;
grant execute on function public.pet_invoice_prefix(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Deleted-invoice record + per-business, per-prefix counters
-- ---------------------------------------------------------------------------
create table if not exists public.pet_deleted_invoices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  invoice_id uuid not null,
  invoice_number text not null,
  status text,
  snapshot jsonb not null,
  deleted_by uuid,
  deleted_at timestamptz not null default now(),
  constraint pet_deleted_invoices_number_uidx unique (salon_id, invoice_number)
);
create index if not exists pet_deleted_invoices_salon_idx on public.pet_deleted_invoices (salon_id, deleted_at desc);
alter table public.pet_deleted_invoices enable row level security;
drop policy if exists "pet_deleted_invoices_select_own_salon" on public.pet_deleted_invoices;
create policy "pet_deleted_invoices_select_own_salon" on public.pet_deleted_invoices for select to authenticated
  using (salon_id = auth_salon_id());
revoke all on public.pet_deleted_invoices from anon;
revoke all on public.pet_deleted_invoices from authenticated;
grant select on public.pet_deleted_invoices to authenticated;

create table if not exists public.pet_invoice_sequences (
  salon_id uuid not null references public.salons(id) on delete cascade,
  prefix text not null check (prefix ~ '^[A-Z0-9]{1,20}$'),
  last_value integer not null check (last_value >= 1),
  primary key (salon_id, prefix)
);
alter table public.pet_invoice_sequences enable row level security;
revoke all on public.pet_invoice_sequences from anon;
revoke all on public.pet_invoice_sequences from authenticated;

-- Internal. The row lock taken by the upsert makes simultaneous invoices for one business take turns, so
-- two invoices can never receive the same number. Only ever counts up.
create or replace function public.pet_allocate_invoice_number(p_salon uuid, p_prefix text) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_seq integer; v_num text;
begin
  insert into public.pet_invoice_sequences as q (salon_id, prefix, last_value) values (p_salon, p_prefix, 1)
  on conflict (salon_id, prefix) do update set last_value = q.last_value + 1
  returning q.last_value into v_seq;
  loop
    v_num := p_prefix || '-INV-' || case when char_length(v_seq::text) >= 4 then v_seq::text else lpad(v_seq::text, 4, '0') end;
    exit when not exists (select 1 from public.pet_invoices where salon_id = p_salon and invoice_number = v_num)
          and not exists (select 1 from public.pet_deleted_invoices where salon_id = p_salon and invoice_number = v_num);
    update public.pet_invoice_sequences set last_value = last_value + 1
     where salon_id = p_salon and prefix = p_prefix returning last_value into v_seq;
  end loop;
  return v_num;
end;
$$;
revoke execute on function public.pet_allocate_invoice_number(uuid, text) from public, anon, authenticated;

-- The functions that create invoices (pet_create_invoice, pet_invoice_stay, pet_daycare_checkout) still hand
-- over a plain 'INV-nnnn' from the old counter. This trigger swaps it for the real number. Invoices that
-- already carry another number are left alone.
create or replace function public.pet_invoices_apply_prefix() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
begin
  if new.invoice_number ~ '^INV-[0-9]+$' then
    new.invoice_number := public.pet_allocate_invoice_number(new.salon_id, public.pet_invoice_prefix(new.salon_id));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permanent delete, accounting-safe
-- ---------------------------------------------------------------------------
-- Nothing deletes a refund any more: back to the 105 guard.
create or replace function public.pet_refunds_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'pet_refunds is append-only';
  end if;
  return old;
end;
$$;

-- Errors (all raised BEFORE the PIN is tried, so the screen can explain without a PIN):
--   NOT_AUTHENTICATED, INVOICE_NOT_FOUND, INVOICE_HAS_PAYMENTS, INVOICE_HAS_REFUNDS, INVOICE_HAS_MPESA.
-- Returns true when deleted, NULL when the admin PIN is wrong or locked out (nothing changed).
create or replace function public.pet_delete_invoice(p_admin_pin text, p_invoice_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_inv public.pet_invoices%rowtype;
  v_row record;
  v_lines jsonb;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_inv from public.pet_invoices where id = p_invoice_id and salon_id = v_salon for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;

  if exists (select 1 from public.pet_payments where invoice_id = p_invoice_id and salon_id = v_salon) then
    raise exception 'INVOICE_HAS_PAYMENTS';
  end if;
  if exists (select 1 from public.pet_refunds where invoice_id = p_invoice_id and salon_id = v_salon) then
    raise exception 'INVOICE_HAS_REFUNDS';
  end if;
  if exists (select 1 from public.salon_mpesa_payments where pet_invoice_id = p_invoice_id and salon_id = v_salon) then
    raise exception 'INVOICE_HAS_MPESA';
  end if;

  -- Step-up proof; a wrong PIN RETURNS (never raises) so the lockout counter still counts (see 091 / 102).
  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then
    return null;
  end if;

  -- A void invoice already put its products back; any other unpaid invoice still holds them.
  if v_inv.status <> 'void' then
    for v_row in select item_id, quantity from public.pet_invoice_lines
                  where invoice_id = p_invoice_id and salon_id = v_salon and item_id is not null loop
      perform public.pet_apply_stock(v_salon, v_row.item_id, v_row.quantity, 'sale_void', 'Invoice deleted', 'invoice', p_invoice_id);
    end loop;
  end if;

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_lines
    from public.pet_invoice_lines l where l.invoice_id = p_invoice_id and l.salon_id = v_salon;
  insert into public.pet_deleted_invoices (salon_id, invoice_id, invoice_number, status, snapshot, deleted_by)
  values (v_salon, v_inv.id, v_inv.invoice_number, v_inv.status,
          to_jsonb(v_inv) || jsonb_build_object('lines', v_lines), auth.uid());

  delete from public.pet_invoices where id = p_invoice_id and salon_id = v_salon; -- lines + delivery log cascade
  return true;
end;
$$;
revoke execute on function public.pet_delete_invoice(text, uuid) from public, anon;
grant execute on function public.pet_delete_invoice(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Business phone numbers behind the admin PIN, no cap
-- ---------------------------------------------------------------------------
drop function if exists public.salon_save_phone_numbers(jsonb);

--   p_phones [{"phone": "0712 345 678", "show_on_invoice": true}, ...]   (any length)
-- Errors: NOT_AUTHENTICATED, INVALID_PHONES, INVALID_PHONE, DUPLICATE_PHONE.
-- Returns the number saved, or NULL when the admin PIN is wrong or locked out (nothing changed).
create or replace function public.salon_save_phone_numbers(p_admin_pin text, p_phones jsonb) returns integer
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_item jsonb; v_phone text; v_pos integer := 0;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_phones is null or jsonb_typeof(p_phones) <> 'array' then raise exception 'INVALID_PHONES'; end if;
  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then
    return null;
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
revoke execute on function public.salon_save_phone_numbers(text, jsonb) from public, anon;
grant execute on function public.salon_save_phone_numbers(text, jsonb) to authenticated;
