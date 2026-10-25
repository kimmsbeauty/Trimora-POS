-- 102_pet_role_admin_step_up.sql
--
-- Trimora Pet -- permissions hardening, part 1 of 2: NEW functions that put an ADMIN-PIN proof
-- in front of every change to roles and role assignments. ADDITIVE ONLY: three new functions.
-- No table, policy, grant or existing function is altered. Part 2 (migration 103, held) later
-- removes the open client write policies on pet_roles / pet_staff_roles.
--
-- STATUS: NOT APPLIED. Applies to production only after the owner says "apply 102" and has
-- seen this exact SQL. (Numbered 102 because 101 is claimed by the held loyalty PR #34.)
--
-- THE PROBLEM (verified against the live project, 2026-10-25)
--   * pet_roles and pet_staff_roles have INSERT/UPDATE/DELETE policies keyed only on
--     salon_id = auth_salon_id(). Every signed-in device of a business can use them --
--     including a device signed in with the STAFF PIN. A staff device can therefore create a
--     role with every permission and assign itself to it.
--   * The staff and admin PINs cannot be told apart server-side: device-pin-login mints the
--     SAME device session (same auth user) for both and only returns "role" to the client.
--     A per-session "is admin" check is therefore impossible without a login change.
--   * Permissions in roleData.js are RECORDED, not ENFORCED (migration 086 / roleData.js).
--
-- THE FIX (same step-up pattern as migration 091)
--   pet_save_role(admin_pin, role_id|null, name, description, permissions) returns uuid
--   pet_delete_role(admin_pin, role_id)                                    returns boolean
--   pet_set_staff_role(admin_pin, staff_id, role_id|null)                  returns boolean
--       Each requires the CURRENT ADMIN PIN, checked with the existing verify_staff_pin()
--       (bcrypt + the existing 5-failures/15-minutes lockout + attempt logging).
--       A wrong PIN RETURNS null/false instead of raising: raising would roll back the
--       failed-attempt row verify_staff_pin just wrote and silently disable the lockout (the
--       same trap migration 091 documents). Every check that can raise runs BEFORE the proof.
--       Validation mirrors the table constraints from migration 086, so a bad request fails
--       with a clear message before any PIN attempt is counted.
--       The existing audit triggers (087) still fire on the writes these functions make.
--
-- WHAT THIS DOES NOT DO (honest limits)
--   * It does not make the old direct writes stop working. Until 103, a staff device can still
--     write the two tables directly. This migration only provides the safe path; the client PR
--     switches to it; 103 closes the old one (same 091 -> 093 sequence).
--   * It does not identify WHICH staff member acts, and does not enforce per-feature
--     permissions (manage_bookings, take_payments, ...). That needs per-staff identity (the
--     later Phase 7 work). It stops the escalation path: only someone who knows the admin PIN
--     can change roles or assignments.
--   * Failed admin-PIN attempts count toward the same lockout as admin login (as in 091).
--
-- ROLLBACK (nothing depends on these until the client PR ships):
--   drop function if exists public.pet_save_role(text, uuid, text, text, jsonb);
--   drop function if exists public.pet_delete_role(text, uuid);
--   drop function if exists public.pet_set_staff_role(text, uuid, uuid);

create or replace function public.pet_save_role(
  p_admin_pin   text,
  p_role_id     uuid,
  p_name        text,
  p_description text,
  p_permissions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid;
  v_name  text;
  v_desc  text;
  v_id    uuid;
begin
  v_salon := auth_salon_id();
  if v_salon is null then
    raise exception 'Not signed in';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then raise exception 'Role name is required'; end if;
  if char_length(v_name) > 60 then raise exception 'Role name must be 60 characters or fewer'; end if;

  v_desc := nullif(btrim(coalesce(p_description, '')), '');
  if v_desc is not null and char_length(v_desc) > 300 then
    raise exception 'Description must be 300 characters or fewer';
  end if;

  if p_permissions is null
     or jsonb_typeof(p_permissions) <> 'object'
     or jsonb_path_exists(p_permissions, '$.* ? (@.type() != "boolean")') then
    raise exception 'Permissions must be an object of true/false values';
  end if;

  if p_role_id is not null
     and not exists (select 1 from public.pet_roles r where r.id = p_role_id and r.salon_id = v_salon) then
    raise exception 'Role not found';
  end if;

  if exists (
    select 1 from public.pet_roles r
    where r.salon_id = v_salon
      and lower(btrim(r.name)) = lower(v_name)
      and (p_role_id is null or r.id <> p_role_id)
  ) then
    raise exception 'A role with that name already exists';
  end if;

  -- The step-up proof (see header: wrong PIN returns null, never raises).
  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then
    return null;
  end if;

  if p_role_id is null then
    insert into public.pet_roles (salon_id, name, description, permissions)
    values (v_salon, v_name, v_desc, p_permissions)
    returning id into v_id;
  else
    update public.pet_roles
       set name = v_name, description = v_desc, permissions = p_permissions
     where id = p_role_id and salon_id = v_salon;
    v_id := p_role_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.pet_delete_role(
  p_admin_pin text,
  p_role_id   uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid;
begin
  v_salon := auth_salon_id();
  if v_salon is null then
    raise exception 'Not signed in';
  end if;

  if p_role_id is null
     or not exists (select 1 from public.pet_roles r where r.id = p_role_id and r.salon_id = v_salon) then
    raise exception 'Role not found';
  end if;

  if exists (select 1 from public.pet_staff_roles sr where sr.role_id = p_role_id and sr.salon_id = v_salon) then
    raise exception 'This role is assigned to staff. Reassign them first';
  end if;

  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then
    return false;
  end if;

  delete from public.pet_roles where id = p_role_id and salon_id = v_salon;
  return true;
end;
$$;

-- p_role_id null = remove the staff member's assignment.
create or replace function public.pet_set_staff_role(
  p_admin_pin text,
  p_staff_id  uuid,
  p_role_id   uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid;
begin
  v_salon := auth_salon_id();
  if v_salon is null then
    raise exception 'Not signed in';
  end if;

  if p_staff_id is null
     or not exists (select 1 from public.staff s where s.id = p_staff_id and s.salon_id = v_salon) then
    raise exception 'Staff member not found';
  end if;

  if p_role_id is not null
     and not exists (select 1 from public.pet_roles r where r.id = p_role_id and r.salon_id = v_salon) then
    raise exception 'Role not found';
  end if;

  if coalesce(p_admin_pin, '') = '' or not verify_staff_pin('admin', p_admin_pin) then
    return false;
  end if;

  if p_role_id is null then
    delete from public.pet_staff_roles where staff_id = p_staff_id and salon_id = v_salon;
  else
    insert into public.pet_staff_roles (salon_id, staff_id, role_id)
    values (v_salon, p_staff_id, p_role_id)
    on conflict (staff_id) do update set role_id = excluded.role_id;
  end if;

  return true;
end;
$$;

-- This project's default privileges grant EXECUTE on new functions straight to anon and
-- authenticated (see README), so revoke by role, then grant only what is intended.
revoke execute on function public.pet_save_role(text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.pet_delete_role(text, uuid) from public, anon, authenticated;
revoke execute on function public.pet_set_staff_role(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.pet_save_role(text, uuid, text, text, jsonb) to authenticated;
grant execute on function public.pet_delete_role(text, uuid) to authenticated;
grant execute on function public.pet_set_staff_role(text, uuid, uuid) to authenticated;
