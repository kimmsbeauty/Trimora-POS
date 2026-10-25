-- 099_pet_loyalty.sql
--
-- Trimora Pet -- Phase 9: loyalty programme (points, tiers, rewards).
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 099".
--
-- ADDITIVE ONLY: five new tables, three triggers and eight functions. Nothing existing is
-- altered. The live invoice and booking functions are NOT replaced: points are
-- awarded by small triggers on pet_invoices and pet_bookings, so the money flow keeps
-- exactly the code that is running today.
--
-- HOW IT WORKS
--   * Off until the owner switches it on (pet_loyalty_settings.enabled). Nothing is
--     back-filled for invoices or bookings that happened before it was switched on.
--   * EARNING. When an invoice becomes PAID, the customer earns
--     floor(invoice total / kes_per_point) points (default: 1 point per KES 100).
--     When a booking becomes COMPLETED, the customer earns visit_bonus points (default
--     0 = no bonus). Both happen in the same transaction as the payment / status
--     change, at most once per invoice and once per booking (unique ledger keys).
--   * FAIL OPEN. If awarding ever errors, the payment or status change still succeeds
--     and a WARNING is written to the database log; a missed award can be fixed with
--     pet_adjust_loyalty. A loyalty bug must never block taking money.
--   * BALANCES are never written by the app. Every change goes through
--     pet_loyalty_apply (internal), which locks the customer's account row, refuses to
--     go below zero (INSUFFICIENT_POINTS) and appends one row to the ledger. The
--     ledger is append-only (no update, no direct delete) and stores the balance after.
--   * TIERS (Bronze / Silver / Gold, the prototype's names) come from LIFETIME points
--     earned against two thresholds the owner sets (silver_at, gold_at). Spending
--     points on rewards never lowers a customer's tier.
--   * REWARDS are owner-defined (name, points cost). Redeeming deducts the points and
--     issues a voucher (status issued). Staff apply it at checkout using the existing
--     discount, then mark it used; cancelling an unused voucher refunds the points.
--     The reward name and cost are copied onto the voucher, so editing a reward later
--     never changes vouchers already issued.
--
-- NOT in this migration: applying a voucher automatically at checkout, a referral
-- bonus, points expiry, reversing points when an invoice is refunded (refunds are not
-- built), showing points on the receipt.
--
-- Tenant safety: customers.id is the only key, so every function re-checks that the
-- customer / reward / voucher belongs to the caller's business. Clients may only READ
-- the tables (and add or edit rewards, never delete them: deactivate instead).
--
-- ROLLBACK (destroys all loyalty data):
--   drop trigger if exists pet_loyalty_booking_completed on public.pet_bookings;
--   drop trigger if exists pet_loyalty_invoice_paid on public.pet_invoices;
--   drop function if exists public.pet_set_redemption_status(uuid, text);
--   drop function if exists public.pet_redeem_reward(uuid, uuid);
--   drop function if exists public.pet_adjust_loyalty(uuid, integer, text);
--   drop function if exists public.pet_save_loyalty_settings(boolean, integer, integer, integer, integer);
--   drop function if exists public.pet_loyalty_on_booking_completed();
--   drop function if exists public.pet_loyalty_on_invoice_paid();
--   drop function if exists public.pet_loyalty_apply(uuid, uuid, integer, text, text, text, uuid);
--   drop table if exists public.pet_loyalty_redemptions, public.pet_loyalty_ledger,
--     public.pet_loyalty_accounts, public.pet_loyalty_rewards, public.pet_loyalty_settings;
--   drop function if exists public.pet_loyalty_ledger_immutable();

create table public.pet_loyalty_settings (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  enabled boolean not null default false,
  kes_per_point integer not null default 100 check (kes_per_point between 1 and 100000),
  visit_bonus integer not null default 0 check (visit_bonus between 0 and 100000),
  silver_at integer not null default 500 check (silver_at >= 0 and silver_at <= 100000000),
  gold_at integer not null default 2000 check (gold_at <= 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_loyalty_settings_salon_uidx unique (salon_id),
  constraint pet_loyalty_tiers_ordered check (gold_at > silver_at)
);

create table public.pet_loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  points_cost integer not null check (points_cost between 1 and 10000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pet_loyalty_rewards_salon_name_uidx on public.pet_loyalty_rewards (salon_id, lower(btrim(name)));

create table public.pet_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  points_balance integer not null default 0 check (points_balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_redeemed integer not null default 0 check (lifetime_redeemed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_loyalty_accounts_customer_uidx unique (salon_id, customer_id)
);

create table public.pet_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  points integer not null check (points <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (reason in ('earn_invoice', 'visit_bonus', 'redeem', 'redeem_refund', 'adjustment')),
  note text,
  reference_type text check (reference_type in ('invoice', 'booking', 'redemption')),
  reference_id uuid,
  created_at timestamptz not null default now()
);
-- one award per invoice and one per booking, however many times a status flips
create unique index pet_loyalty_ledger_award_uidx on public.pet_loyalty_ledger (salon_id, reason, reference_id)
  where reason in ('earn_invoice', 'visit_bonus') and reference_id is not null;
create index pet_loyalty_ledger_customer_idx on public.pet_loyalty_ledger (salon_id, customer_id, created_at desc);

create table public.pet_loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  reward_id uuid not null references public.pet_loyalty_rewards(id),
  reward_name text not null check (btrim(reward_name) <> ''),
  points_cost integer not null check (points_cost > 0),
  status text not null default 'issued' check (status in ('issued', 'used', 'cancelled')),
  issued_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pet_loyalty_redemptions_salon_idx on public.pet_loyalty_redemptions (salon_id, status, issued_at desc);
create index pet_loyalty_redemptions_customer_idx on public.pet_loyalty_redemptions (customer_id);

-- Ledger is append-only for everyone, including the functions: no UPDATE and no
-- direct DELETE. A DELETE that arrives through a foreign-key cascade runs one trigger
-- level deeper and is allowed (same rule as the stock ledger in 094).
create function public.pet_loyalty_ledger_immutable() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'pet_loyalty_ledger is append-only';
  end if;
  return old;
end;
$$;
create trigger pet_loyalty_ledger_no_change before update or delete on public.pet_loyalty_ledger
  for each row execute function public.pet_loyalty_ledger_immutable();

create trigger pet_loyalty_settings_touch_updated_at before update on public.pet_loyalty_settings
  for each row execute function public.pet_touch_updated_at();
create trigger pet_loyalty_rewards_touch_updated_at before update on public.pet_loyalty_rewards
  for each row execute function public.pet_touch_updated_at();
create trigger pet_loyalty_accounts_touch_updated_at before update on public.pet_loyalty_accounts
  for each row execute function public.pet_touch_updated_at();
create trigger pet_loyalty_redemptions_touch_updated_at before update on public.pet_loyalty_redemptions
  for each row execute function public.pet_touch_updated_at();

create trigger pet_loyalty_settings_audit after insert or update or delete on public.pet_loyalty_settings
  for each row execute function public.pet_audit_row();
create trigger pet_loyalty_rewards_audit after insert or update or delete on public.pet_loyalty_rewards
  for each row execute function public.pet_audit_row();
create trigger pet_loyalty_accounts_audit after insert or update or delete on public.pet_loyalty_accounts
  for each row execute function public.pet_audit_row();
create trigger pet_loyalty_ledger_audit after insert or update or delete on public.pet_loyalty_ledger
  for each row execute function public.pet_audit_row();
create trigger pet_loyalty_redemptions_audit after insert or update or delete on public.pet_loyalty_redemptions
  for each row execute function public.pet_audit_row();

alter table public.pet_loyalty_settings enable row level security;
alter table public.pet_loyalty_rewards enable row level security;
alter table public.pet_loyalty_accounts enable row level security;
alter table public.pet_loyalty_ledger enable row level security;
alter table public.pet_loyalty_redemptions enable row level security;

create policy "pet_loyalty_settings_select_own_salon" on public.pet_loyalty_settings for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_loyalty_accounts_select_own_salon" on public.pet_loyalty_accounts for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_loyalty_ledger_select_own_salon" on public.pet_loyalty_ledger for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_loyalty_redemptions_select_own_salon" on public.pet_loyalty_redemptions for select to authenticated
  using (salon_id = auth_salon_id());

-- Rewards: the app may add and edit them (never delete: deactivate).
create policy "pet_loyalty_rewards_select_own_salon" on public.pet_loyalty_rewards for select to authenticated
  using (salon_id = auth_salon_id());
create policy "pet_loyalty_rewards_insert_own_salon" on public.pet_loyalty_rewards for insert to authenticated
  with check (salon_id = auth_salon_id());
create policy "pet_loyalty_rewards_update_own_salon" on public.pet_loyalty_rewards for update to authenticated
  using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

revoke all on public.pet_loyalty_settings from anon;
revoke all on public.pet_loyalty_settings from authenticated;
grant select on public.pet_loyalty_settings to authenticated;
revoke all on public.pet_loyalty_accounts from anon;
revoke all on public.pet_loyalty_accounts from authenticated;
grant select on public.pet_loyalty_accounts to authenticated;
revoke all on public.pet_loyalty_ledger from anon;
revoke all on public.pet_loyalty_ledger from authenticated;
grant select on public.pet_loyalty_ledger to authenticated;
revoke all on public.pet_loyalty_redemptions from anon;
revoke all on public.pet_loyalty_redemptions from authenticated;
grant select on public.pet_loyalty_redemptions to authenticated;
revoke all on public.pet_loyalty_rewards from anon;
revoke all on public.pet_loyalty_rewards from authenticated;
grant select on public.pet_loyalty_rewards to authenticated;
grant insert (salon_id, name, points_cost, active) on public.pet_loyalty_rewards to authenticated;
grant update (name, points_cost, active) on public.pet_loyalty_rewards to authenticated;

-- ---------------------------------------------------------------------------
-- pet_loyalty_apply (internal): the ONE place a balance changes. Creates the
-- customer's account on first use, locks it, refuses to go below zero, updates the
-- totals and appends the ledger row. Returns the new balance, or NULL when this
-- invoice / booking has already been awarded (nothing is written).
-- Errors: INSUFFICIENT_POINTS, POINTS_TOO_LARGE.
-- ---------------------------------------------------------------------------
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
           when p_reason = 'adjustment' then greatest(0, lifetime_earned + p_points)
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

-- ---------------------------------------------------------------------------
-- Earning triggers. They never block the payment / status change that fired them.
-- ---------------------------------------------------------------------------
create or replace function public.pet_loyalty_on_invoice_paid() returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_set public.pet_loyalty_settings%rowtype;
  v_points integer;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    begin
      select * into v_set from public.pet_loyalty_settings where salon_id = new.salon_id;
      if found and v_set.enabled then
        v_points := (new.total / v_set.kes_per_point)::integer;
        if v_points > 0 then
          perform public.pet_loyalty_apply(new.salon_id, new.customer_id, v_points, 'earn_invoice', null, 'invoice', new.id);
        end if;
      end if;
    exception when others then
      raise warning 'pet loyalty: points not awarded for invoice %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;
create trigger pet_loyalty_invoice_paid after insert or update of status on public.pet_invoices
  for each row execute function public.pet_loyalty_on_invoice_paid();

create or replace function public.pet_loyalty_on_booking_completed() returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_set public.pet_loyalty_settings%rowtype;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    begin
      select * into v_set from public.pet_loyalty_settings where salon_id = new.salon_id;
      if found and v_set.enabled and v_set.visit_bonus > 0 then
        perform public.pet_loyalty_apply(new.salon_id, new.customer_id, v_set.visit_bonus, 'visit_bonus', null, 'booking', new.id);
      end if;
    exception when others then
      raise warning 'pet loyalty: visit bonus not awarded for booking %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;
create trigger pet_loyalty_booking_completed after update of status on public.pet_bookings
  for each row execute function public.pet_loyalty_on_booking_completed();

-- ---------------------------------------------------------------------------
-- App-facing functions. Errors: NOT_AUTHENTICATED plus those named below.
-- ---------------------------------------------------------------------------

-- Switch the programme on/off and set its rules. INVALID_SETTINGS when a value is out
-- of range or the Gold threshold is not above Silver.
create or replace function public.pet_save_loyalty_settings(
  p_enabled boolean, p_kes_per_point integer, p_visit_bonus integer, p_silver_at integer, p_gold_at integer
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_enabled is null or p_kes_per_point is null or p_visit_bonus is null or p_silver_at is null or p_gold_at is null
     or p_kes_per_point not between 1 and 100000 or p_visit_bonus not between 0 and 100000
     or p_silver_at not between 0 and 100000000 or p_gold_at not between 1 and 100000000 or p_gold_at <= p_silver_at then
    raise exception 'INVALID_SETTINGS';
  end if;
  insert into public.pet_loyalty_settings (salon_id, enabled, kes_per_point, visit_bonus, silver_at, gold_at)
  values (v_salon, p_enabled, p_kes_per_point, p_visit_bonus, p_silver_at, p_gold_at)
  on conflict (salon_id) do update
    set enabled = excluded.enabled, kes_per_point = excluded.kes_per_point, visit_bonus = excluded.visit_bonus,
        silver_at = excluded.silver_at, gold_at = excluded.gold_at;
end;
$$;

-- Manual correction or goodwill points (+ or -). A note is required.
-- Errors: CUSTOMER_NOT_FOUND, INVALID_ADJUSTMENT, NOTE_REQUIRED, INSUFFICIENT_POINTS.
-- Returns the new balance.
create or replace function public.pet_adjust_loyalty(p_customer_id uuid, p_points integer, p_note text)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_points is null or p_points = 0 or abs(p_points) > 1000000 then raise exception 'INVALID_ADJUSTMENT'; end if;
  if btrim(coalesce(p_note, '')) = '' then raise exception 'NOTE_REQUIRED'; end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.salon_id = v_salon) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  return public.pet_loyalty_apply(v_salon, p_customer_id, p_points, 'adjustment', p_note, null, null);
end;
$$;

-- Spend points on a reward: deducts them and issues a voucher. Returns the voucher id.
-- Errors: PROGRAM_DISABLED, CUSTOMER_NOT_FOUND, REWARD_NOT_FOUND, INSUFFICIENT_POINTS.
create or replace function public.pet_redeem_reward(p_customer_id uuid, p_reward_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_enabled boolean;
  v_reward public.pet_loyalty_rewards%rowtype;
  v_id uuid;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select s.enabled into v_enabled from public.pet_loyalty_settings s where s.salon_id = v_salon;
  if not coalesce(v_enabled, false) then raise exception 'PROGRAM_DISABLED'; end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.salon_id = v_salon) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  select * into v_reward from public.pet_loyalty_rewards r where r.id = p_reward_id and r.salon_id = v_salon and r.active;
  if not found then raise exception 'REWARD_NOT_FOUND'; end if;
  insert into public.pet_loyalty_redemptions (salon_id, customer_id, reward_id, reward_name, points_cost)
  values (v_salon, p_customer_id, v_reward.id, v_reward.name, v_reward.points_cost)
  returning id into v_id;
  perform public.pet_loyalty_apply(v_salon, p_customer_id, -v_reward.points_cost, 'redeem', v_reward.name, 'redemption', v_id);
  return v_id;
end;
$$;

-- Mark a voucher used, or cancel it (cancelling refunds the points). Only an issued
-- voucher can change. Errors: REDEMPTION_NOT_FOUND, INVALID_STATUS_CHANGE.
create or replace function public.pet_set_redemption_status(p_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
  v_r public.pet_loyalty_redemptions%rowtype;
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_r from public.pet_loyalty_redemptions where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'REDEMPTION_NOT_FOUND'; end if;
  if v_r.status <> 'issued' or p_status not in ('used', 'cancelled') then raise exception 'INVALID_STATUS_CHANGE'; end if;
  update public.pet_loyalty_redemptions set status = p_status, resolved_at = now() where id = p_id and salon_id = v_salon;
  if p_status = 'cancelled' then
    perform public.pet_loyalty_apply(v_salon, v_r.customer_id, v_r.points_cost, 'redeem_refund', v_r.reward_name, 'redemption', v_r.id);
  end if;
  return p_status;
end;
$$;

-- Default privileges here grant EXECUTE to anon and authenticated, so revoke explicitly.
revoke execute on function public.pet_loyalty_apply(uuid, uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.pet_loyalty_on_invoice_paid() from public, anon, authenticated;
revoke execute on function public.pet_loyalty_on_booking_completed() from public, anon, authenticated;
revoke execute on function public.pet_save_loyalty_settings(boolean, integer, integer, integer, integer) from public, anon;
revoke execute on function public.pet_adjust_loyalty(uuid, integer, text) from public, anon;
revoke execute on function public.pet_redeem_reward(uuid, uuid) from public, anon;
revoke execute on function public.pet_set_redemption_status(uuid, text) from public, anon;
grant execute on function public.pet_save_loyalty_settings(boolean, integer, integer, integer, integer) to authenticated;
grant execute on function public.pet_adjust_loyalty(uuid, integer, text) to authenticated;
grant execute on function public.pet_redeem_reward(uuid, uuid) to authenticated;
grant execute on function public.pet_set_redemption_status(uuid, text) to authenticated;
