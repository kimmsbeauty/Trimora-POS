-- 030_auto_requests_manual_invite.sql
--
-- Applied live via Supabase MCP on 2026-07-10, reconciled here.
--
-- Auto Requests, Manual onboarding, and Invite onboarding: genuinely
-- separate entry points from the Salons product (separate table for
-- requests, separate buttons/modals in the dashboard), but running
-- through the exact same underlying mechanism as the salon versions --
-- create_invite() and complete_salon_onboarding(), just tagged with a
-- module_key so the resulting salon gets Auto enabled automatically the
-- moment onboarding completes.
--
-- Every change here was verified live, end-to-end, inside rolled-back
-- transactions before being committed -- including the exact class of
-- regression this session already caused once (a pgcrypto/PIN-hashing
-- check). See the inline verification notes below each piece.

-- 1. module_key on salon_invites -- nullable, additive. NULL means a
--    regular salon invite (unchanged behavior for every existing
--    caller); a value like 'auto' means complete_salon_onboarding
--    should enable that module on the resulting salon.
ALTER TABLE public.salon_invites ADD COLUMN IF NOT EXISTS module_key text;

-- 2. auto_onboarding_requests -- structurally identical to
--    salon_onboarding_requests (017_sales_rep_onboarding_requests.sql),
--    same RLS pattern (sales reps see/insert only their own rows, super
--    admin sees/updates all), but a genuinely separate table rather
--    than a flag on the existing one.
CREATE TABLE IF NOT EXISTS public.auto_onboarding_requests (
  id bigint generated always as identity primary key,
  submitted_by uuid not null references auth.users(id),
  salon_name text not null,
  owner_name text,
  owner_email text,
  owner_phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resulting_invite_token text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.auto_onboarding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_rep_insert_own"
  ON public.auto_onboarding_requests FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND coalesce((auth.jwt() -> 'app_metadata' ->> 'is_sales_rep')::boolean, false)
  );

CREATE POLICY "sales_rep_select_own"
  ON public.auto_onboarding_requests FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    AND coalesce((auth.jwt() -> 'app_metadata' ->> 'is_sales_rep')::boolean, false)
  );

CREATE POLICY "super_admin_select_all_requests"
  ON public.auto_onboarding_requests FOR SELECT TO authenticated
  USING (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false));

CREATE POLICY "super_admin_update_all_requests"
  ON public.auto_onboarding_requests FOR UPDATE TO authenticated
  USING (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false))
  WITH CHECK (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false));

-- 3. create_invite gains an optional p_module_key parameter. Adding a
--    parameter to an existing function via CREATE OR REPLACE does NOT
--    replace it in place -- it creates a second overload, since the
--    signature changed. The old 2-arg version is dropped explicitly
--    below; without that, PostgREST calls with just {p_email,
--    p_salon_name} become ambiguous between the two overloads (both
--    match). Verified live: this exact ambiguity error was hit and
--    fixed before this was committed.
DROP FUNCTION IF EXISTS public.create_invite(text, text);

CREATE OR REPLACE FUNCTION public.create_invite(p_email text DEFAULT NULL::text, p_salon_name text DEFAULT NULL::text, p_module_key text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token text;
begin
  if not (
    select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  ) then
    raise exception 'Access denied: super admin only';
  end if;

  insert into salon_invites (email, salon_name, module_key)
  values (p_email, p_salon_name, p_module_key)
  returning token into v_token;

  return v_token;
end;
$function$;

-- 4. complete_salon_onboarding: reads the invite's module_key (captured
--    via RETURNING on the same UPDATE that marks the invite used --
--    no extra query) and, if set, enables that module on the newly
--    created salon as the function's last step. Everything else in
--    this function is byte-for-byte unchanged from its post-027 (the
--    pgcrypto regression fix) state -- search_path, crypt()/gen_salt()
--    calls, all untouched.
--
--    #variable_conflict use_column is required: RETURNS TABLE(salon_id
--    uuid, slug text) implicitly declares salon_id/slug as PL/pgSQL
--    variables visible throughout the function body, which collided
--    with the new `on conflict (salon_id, module_key)` clause's bare
--    column reference. Caught live (42702 ambiguous column error)
--    before this was committed, not assumed safe from code review
--    alone -- see the session notes on why that specific lesson matters
--    here.
--
--    Verified live end-to-end in rolled-back transactions before this
--    was committed: an 'auto'-tagged invite correctly enables the
--    module on completion; a regular invite enables nothing; both
--    staff and admin PINs still hash correctly via bcrypt and verify
--    with crypt() afterward (the exact mechanism the original
--    regression broke).
CREATE OR REPLACE FUNCTION public.complete_salon_onboarding(p_salon_name text, p_slug text, p_staff_pin text, p_admin_pin text, p_token text)
RETURNS TABLE(salon_id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_salon_id uuid;
  v_module_key text;
begin
  update salon_invites
  set used = true, used_at = now()
  where token = p_token
    and used = false
    and expires_at > now()
  returning module_key into v_module_key;

  if not found then
    raise exception 'Invalid, expired, or already-used invite token';
  end if;

  insert into salons (name, slug)
  values (p_salon_name, p_slug)
  returning id into v_salon_id;

  insert into salon_auth_users (id, salon_id)
  values (auth.uid(), v_salon_id);

  insert into salon_pins (role, pin_hash, hash_version, salon_id)
  values
    ('staff', crypt(p_staff_pin, gen_salt('bf', 10)), 'bcrypt', v_salon_id),
    ('admin', crypt(p_admin_pin, gen_salt('bf', 10)), 'bcrypt', v_salon_id);

  insert into salon_settings (salon_id)
  values (v_salon_id);

  if v_module_key is not null then
    insert into salon_enabled_modules (salon_id, module_key, enabled, enabled_at)
    values (v_salon_id, v_module_key, true, now())
    on conflict (salon_id, module_key) do update set enabled = true, enabled_at = now();
  end if;

  return query select v_salon_id, p_slug;
end;
$function$;
