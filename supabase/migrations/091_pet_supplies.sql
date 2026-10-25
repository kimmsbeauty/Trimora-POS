-- 091_pet_supplies.sql
--
-- Trimora Pet -- Phase 8: supplies and inventory (retail products and consumables).
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 091".
--
-- ADDITIVE ONLY: five new tables and four functions. It does NOT touch the shared
-- `stock` table that Salon and Auto use (that table has no SKU, cost, unit or
-- reorder level, and its quantity is edited directly). Pet gets its own.
--
-- TWO KINDS OF ITEM, kept apart on purpose:
--   retail      sold on invoices (needs a selling price)
--   consumable  used up by grooming/boarding (shampoo, gloves), never sold
--
-- STOCK RULES
--   * quantity_on_hand is never written by the app. The app can add and edit
--     items (name, sku, price, cost, ...) but every change to the quantity goes
--     through the functions below, which also write one row to the append-only
--     ledger pet_stock_movements. The ledger cannot be updated or deleted, not
--     even by the functions (a trigger refuses).
--   * Stock can never go below zero (INSUFFICIENT_STOCK), and the check is made
--     under a row lock, so two simultaneous sales cannot both take the last unit.
--   * Receipts are idempotent (a key per receipt), so a retry never doubles stock.
--   * Every movement stores the quantity after it, so the history is auditable.
--
-- FUNCTIONS
--   pet_apply_stock (internal)  one controlled place that changes a quantity.
--                               Not callable by the app; used by the others and by
--                               migration 092 (invoice sales).
--   pet_receive_stock           record a purchase / stock receipt (supplier,
--                               reference, lines with quantity and optional cost).
--   pet_adjust_stock            opening stock, count corrections, damaged, expired.
--   pet_use_supplies            record consumables used, optionally for a booking.
--
-- NOT in this migration: selling products on invoices (migration 092), batch or
-- expiry tracking, purchase orders, supplier payments, returns to supplier.
--
-- ROLLBACK (destroys all supplies data):
--   drop function if exists public.pet_use_supplies(uuid, jsonb);
--   drop function if exists public.pet_adjust_stock(uuid, integer, text, text);
--   drop function if exists public.pet_receive_stock(uuid, uuid, text, text, jsonb);
--   drop function if exists public.pet_apply_stock(uuid, uuid, integer, text, text, text, uuid);
--   drop table if exists public.pet_purchase_lines, public.pet_purchases, public.pet_stock_movements,
--     public.pet_items, public.pet_suppliers;

create table public.pet_suppliers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pet_suppliers_salon_name_uidx on public.pet_suppliers (salon_id, lower(btrim(name)));

create table public.pet_items (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  kind text not null default 'retail' check (kind in ('retail', 'consumable')),
  name text not null check (btrim(name) <> ''),
  sku text,
  category text,
  unit text not null default 'each' check (btrim(unit) <> ''),
  price integer check (price is null or (price >= 0 and price <= 10000000)),
  cost integer check (cost is null or (cost >= 0 and cost <= 10000000)),
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  supplier_id uuid references public.pet_suppliers(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_items_retail_has_price check (kind = 'consumable' or price is not null)
);
create unique index pet_items_salon_kind_name_uidx on public.pet_items (salon_id, kind, lower(btrim(name)));
create unique index pet_items_salon_sku_uidx on public.pet_items (salon_id, lower(btrim(sku)))
  where sku is not null and btrim(sku) <> '';
create index pet_items_salon_active_idx on public.pet_items (salon_id, active);

create table public.pet_stock_movements (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  item_id uuid not null references public.pet_items(id) on delete restrict,
  change_qty integer not null check (change_qty <> 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason text not null check (reason in ('opening', 'purchase', 'sale', 'sale_void', 'adjustment', 'damaged', 'expired', 'used')),
  note text,
  reference_type text check (reference_type in ('purchase', 'invoice', 'booking')),
  reference_id uuid,
  created_at timestamptz not null default now()
);
create index pet_stock_movements_item_idx on public.pet_stock_movements (salon_id, item_id, created_at desc);

create table public.pet_purchases (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  supplier_id uuid references public.pet_suppliers(id) on delete restrict,
  idempotency_key uuid not null,
  reference text,
  note text,
  total_cost integer not null default 0 check (total_cost >= 0),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pet_purchases_idempotency_uidx unique (salon_id, idempotency_key)
);
create index pet_purchases_salon_idx on public.pet_purchases (salon_id, received_at desc);

create table public.pet_purchase_lines (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  purchase_id uuid not null references public.pet_purchases(id) on delete cascade,
  item_id uuid not null references public.pet_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost integer check (unit_cost is null or unit_cost >= 0),
  line_cost integer not null default 0 check (line_cost >= 0),
  unique (purchase_id, item_id)
);

-- Ledger is append-only for everyone, including the functions: no UPDATE, and no
-- direct DELETE. A DELETE that arrives through a foreign-key cascade (a whole
-- business being removed) runs one trigger level deeper and is allowed, so
-- removing a business is not blocked by its own history.
create function public.pet_stock_movements_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'pet_stock_movements is append-only';
  end if;
  return old;
end;
$$;
create trigger pet_stock_movements_no_change before update or delete on public.pet_stock_movements
  for each row execute function public.pet_stock_movements_immutable();

create trigger pet_suppliers_touch_updated_at before update on public.pet_suppliers
  for each row execute function public.pet_touch_updated_at();
create trigger pet_items_touch_updated_at before update on public.pet_items
  for each row execute function public.pet_touch_updated_at();
create trigger pet_suppliers_audit after insert or update or delete on public.pet_suppliers
  for each row execute function public.pet_audit_row();
create trigger pet_items_audit after insert or update or delete on public.pet_items
  for each row execute function public.pet_audit_row();
create trigger pet_stock_movements_audit after insert or update or delete on public.pet_stock_movements
  for each row execute function public.pet_audit_row();
create trigger pet_purchases_audit after insert or update or delete on public.pet_purchases
  for each row execute function public.pet_audit_row();
create trigger pet_purchase_lines_audit after insert or update or delete on public.pet_purchase_lines
  for each row execute function public.pet_audit_row();

alter table public.pet_suppliers enable row level security;
alter table public.pet_items enable row level security;
alter table public.pet_stock_movements enable row level security;
alter table public.pet_purchases enable row level security;
alter table public.pet_purchase_lines enable row level security;

-- Suppliers and items: the app may add and edit them (never delete: deactivate).
create policy "pet_suppliers_select_own_salon" on public.pet_suppliers for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_suppliers_insert_own_salon" on public.pet_suppliers for insert to authenticated
  with check (salon_id = auth_salon_id());
create policy "pet_suppliers_update_own_salon" on public.pet_suppliers for update to authenticated
  using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "pet_items_select_own_salon" on public.pet_items for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_items_insert_own_salon" on public.pet_items for insert to authenticated
  with check (
    salon_id = auth_salon_id()
    and (supplier_id is null or exists (select 1 from public.pet_suppliers s where s.id = supplier_id and s.salon_id = auth_salon_id()))
  );
create policy "pet_items_update_own_salon" on public.pet_items for update to authenticated
  using (salon_id = auth_salon_id())
  with check (
    salon_id = auth_salon_id()
    and (supplier_id is null or exists (select 1 from public.pet_suppliers s where s.id = supplier_id and s.salon_id = auth_salon_id()))
  );

-- Ledger, purchases and purchase lines: read-only for the app.
create policy "pet_stock_movements_select_own_salon" on public.pet_stock_movements for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_purchases_select_own_salon" on public.pet_purchases for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_purchase_lines_select_own_salon" on public.pet_purchase_lines for select to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_suppliers from anon;
revoke all on public.pet_suppliers from authenticated;
grant select on public.pet_suppliers to authenticated;
grant insert (salon_id, name, phone, email, notes, active) on public.pet_suppliers to authenticated;
grant update (name, phone, email, notes, active) on public.pet_suppliers to authenticated;

-- quantity_on_hand is deliberately missing from both column lists below.
revoke all on public.pet_items from anon;
revoke all on public.pet_items from authenticated;
grant select on public.pet_items to authenticated;
grant insert (salon_id, kind, name, sku, category, unit, price, cost, reorder_level, supplier_id, active) on public.pet_items to authenticated;
grant update (name, sku, category, unit, price, cost, reorder_level, supplier_id, active) on public.pet_items to authenticated;

revoke all on public.pet_stock_movements from anon;
revoke all on public.pet_stock_movements from authenticated;
grant select on public.pet_stock_movements to authenticated;
revoke all on public.pet_purchases from anon;
revoke all on public.pet_purchases from authenticated;
grant select on public.pet_purchases to authenticated;
revoke all on public.pet_purchase_lines from anon;
revoke all on public.pet_purchase_lines from authenticated;
grant select on public.pet_purchase_lines to authenticated;

-- ---------------------------------------------------------------------------
-- pet_apply_stock (internal): the ONE place a quantity changes. Locks the item
-- row, refuses to go below zero, updates the quantity and writes the ledger row.
-- Errors: ITEM_NOT_FOUND, INSUFFICIENT_STOCK, QUANTITY_TOO_LARGE.
-- ---------------------------------------------------------------------------
create or replace function public.pet_apply_stock(
  p_salon uuid, p_item uuid, p_change integer, p_reason text, p_note text, p_ref_type text, p_ref_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_qty integer;
  v_new bigint;
begin
  select quantity_on_hand into v_qty from public.pet_items where id = p_item and salon_id = p_salon for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_new := v_qty::bigint + p_change;
  if v_new < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  if v_new > 100000000 then raise exception 'QUANTITY_TOO_LARGE'; end if;
  update public.pet_items set quantity_on_hand = v_new where id = p_item and salon_id = p_salon;
  insert into public.pet_stock_movements (salon_id, item_id, change_qty, quantity_after, reason, note, reference_type, reference_id)
  values (p_salon, p_item, p_change, v_new, p_reason, nullif(btrim(coalesce(p_note, '')), ''), p_ref_type, p_ref_id);
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- pet_receive_stock: one purchase / stock receipt, all lines or none.
--   p_lines [{"item_id": "...", "quantity": 12, "unit_cost": 450}, ...]
--   (unit_cost optional; when given it also becomes the item's current cost)
-- Returns the purchase id (the existing one when the same key is sent again).
-- Errors: NOT_AUTHENTICATED, INVALID_KEY, SUPPLIER_NOT_FOUND, INVALID_LINES,
-- ITEM_NOT_FOUND, QUANTITY_TOO_LARGE.
-- ---------------------------------------------------------------------------
create or replace function public.pet_receive_stock(
  p_idempotency_key uuid,
  p_supplier_id uuid,
  p_reference text,
  p_note text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_id uuid;
  v_existing uuid;
  v_line jsonb;
  v_item uuid;
  v_qty bigint;
  v_cost bigint;
  v_total bigint := 0;
  v_ids uuid[] := '{}';
  v_constraint text;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_KEY'; end if;
  select id into v_existing from public.pet_purchases where salon_id = v_salon and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  if p_supplier_id is not null and not exists (
       select 1 from public.pet_suppliers s where s.id = p_supplier_id and s.salon_id = v_salon) then
    raise exception 'SUPPLIER_NOT_FOUND';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 60 then
    raise exception 'INVALID_LINES';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_item := (v_line ->> 'item_id')::uuid;
      v_qty := (v_line ->> 'quantity')::bigint;
      v_cost := case when v_line ->> 'unit_cost' is null or btrim(v_line ->> 'unit_cost') = '' then null else (v_line ->> 'unit_cost')::bigint end;
    exception when others then raise exception 'INVALID_LINES';
    end;
    if v_item is null or v_qty is null or v_qty < 1 or v_qty > 1000000 or (v_cost is not null and (v_cost < 0 or v_cost > 10000000)) then
      raise exception 'INVALID_LINES';
    end if;
    if v_item = any (v_ids) then raise exception 'INVALID_LINES'; end if;
    v_ids := v_ids || v_item;
    if not exists (select 1 from public.pet_items i where i.id = v_item and i.salon_id = v_salon) then
      raise exception 'ITEM_NOT_FOUND';
    end if;
    v_total := v_total + coalesce(v_cost, 0) * v_qty;
  end loop;
  if v_total > 1000000000 then raise exception 'QUANTITY_TOO_LARGE'; end if;

  insert into public.pet_purchases (salon_id, supplier_id, idempotency_key, reference, note, total_cost)
  values (v_salon, p_supplier_id, p_idempotency_key, nullif(btrim(coalesce(p_reference, '')), ''),
          nullif(btrim(coalesce(p_note, '')), ''), v_total)
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line ->> 'item_id')::uuid;
    v_qty := (v_line ->> 'quantity')::bigint;
    v_cost := case when v_line ->> 'unit_cost' is null or btrim(v_line ->> 'unit_cost') = '' then null else (v_line ->> 'unit_cost')::bigint end;
    insert into public.pet_purchase_lines (salon_id, purchase_id, item_id, quantity, unit_cost, line_cost)
    values (v_salon, v_id, v_item, v_qty, v_cost, coalesce(v_cost, 0) * v_qty);
    perform public.pet_apply_stock(v_salon, v_item, v_qty::integer, 'purchase', null, 'purchase', v_id);
    if v_cost is not null then
      update public.pet_items set cost = v_cost where id = v_item and salon_id = v_salon;
    end if;
  end loop;
  return v_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pet_purchases_idempotency_uidx' then
      select id into v_existing from public.pet_purchases where salon_id = v_salon and idempotency_key = p_idempotency_key;
      if found then return v_existing; end if;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- pet_adjust_stock: change one item's quantity by hand.
--   p_reason 'opening'    first stock for an item with no history (positive)
--            'adjustment' a count correction (+ or -; a note is required)
--            'damaged' / 'expired'  write-offs (negative)
-- Returns the new quantity.
-- Errors: NOT_AUTHENTICATED, ITEM_NOT_FOUND, INVALID_ADJUSTMENT, NOTE_REQUIRED,
-- OPENING_NOT_ALLOWED, INSUFFICIENT_STOCK, QUANTITY_TOO_LARGE.
-- ---------------------------------------------------------------------------
create or replace function public.pet_adjust_stock(
  p_item_id uuid, p_change integer, p_reason text, p_note text default null
) returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_change is null or p_change = 0 or abs(p_change) > 1000000
     or p_reason is null or p_reason not in ('opening', 'adjustment', 'damaged', 'expired') then
    raise exception 'INVALID_ADJUSTMENT';
  end if;
  if p_reason in ('damaged', 'expired') and p_change > 0 then raise exception 'INVALID_ADJUSTMENT'; end if;
  if p_reason = 'opening' and p_change < 0 then raise exception 'INVALID_ADJUSTMENT'; end if;
  if p_reason = 'adjustment' and btrim(coalesce(p_note, '')) = '' then raise exception 'NOTE_REQUIRED'; end if;
  perform 1 from public.pet_items where id = p_item_id and salon_id = v_salon for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if p_reason = 'opening' and exists (select 1 from public.pet_stock_movements where item_id = p_item_id and salon_id = v_salon) then
    raise exception 'OPENING_NOT_ALLOWED';
  end if;
  return public.pet_apply_stock(v_salon, p_item_id, p_change, p_reason, p_note, null, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- pet_use_supplies: record consumables used up (optionally for a booking).
--   p_items [{"item_id": "...", "quantity": 2}, ...]  (consumables only)
-- Returns how many items were recorded.
-- Errors: NOT_AUTHENTICATED, INVALID_LINES, ITEM_NOT_FOUND, NOT_A_CONSUMABLE,
-- BOOKING_NOT_FOUND, INSUFFICIENT_STOCK.
-- ---------------------------------------------------------------------------
create or replace function public.pet_use_supplies(p_booking_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_line jsonb;
  v_item uuid;
  v_qty bigint;
  v_kind text;
  v_n integer := 0;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_booking_id is not null and not exists (
       select 1 from public.pet_bookings b where b.id = p_booking_id and b.salon_id = v_salon) then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 40 then
    raise exception 'INVALID_LINES';
  end if;
  for v_line in select * from jsonb_array_elements(p_items) loop
    begin
      v_item := (v_line ->> 'item_id')::uuid;
      v_qty := (v_line ->> 'quantity')::bigint;
    exception when others then raise exception 'INVALID_LINES';
    end;
    if v_item is null or v_qty is null or v_qty < 1 or v_qty > 100000 then raise exception 'INVALID_LINES'; end if;
    select i.kind into v_kind from public.pet_items i where i.id = v_item and i.salon_id = v_salon;
    if not found then raise exception 'ITEM_NOT_FOUND'; end if;
    if v_kind <> 'consumable' then raise exception 'NOT_A_CONSUMABLE'; end if;
  end loop;
  for v_line in select * from jsonb_array_elements(p_items) loop
    perform public.pet_apply_stock(v_salon, (v_line ->> 'item_id')::uuid, -((v_line ->> 'quantity')::integer), 'used', null,
      case when p_booking_id is null then null else 'booking' end, p_booking_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.pet_apply_stock(uuid, uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.pet_receive_stock(uuid, uuid, text, text, jsonb) from public, anon;
revoke execute on function public.pet_adjust_stock(uuid, integer, text, text) from public, anon;
revoke execute on function public.pet_use_supplies(uuid, jsonb) from public, anon;
grant execute on function public.pet_receive_stock(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.pet_adjust_stock(uuid, integer, text, text) to authenticated;
grant execute on function public.pet_use_supplies(uuid, jsonb) to authenticated;
