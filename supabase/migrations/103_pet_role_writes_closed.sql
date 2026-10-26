-- 103_pet_role_writes_closed.sql
--
-- Trimora Pet -- permissions hardening, part 2 of 2: remove the open client write path to roles
-- and role assignments. After this, the ONLY way to create, edit or delete a role, or to assign /
-- change / clear a staff member's role, is through the admin-PIN functions from migration 102.
--
-- STATUS: APPLIED to production 2026-10-26 on the owner's instruction ("apply 103"), after 102
-- (2026-10-25) and the client PR #42 were live. Verified from the catalog afterwards: only the two
-- SELECT policies remain; `authenticated` holds SELECT but no INSERT/UPDATE/DELETE on either table;
-- anon holds nothing. NOT exercised end to end against production (no staging project).
--
-- THE PROBLEM (verified against the live project, 2026-10-25)
--   pet_roles and pet_staff_roles still carry INSERT/UPDATE/DELETE policies keyed only on
--   salon_id = auth_salon_id(), and `authenticated` holds INSERT/UPDATE/DELETE on both tables.
--   Any signed-in device of a business, including one signed in with the STAFF PIN, can bypass
--   the admin-PIN functions and write the tables directly (for example create an
--   all-permissions role and assign itself to it).
--
-- WHAT IT DOES
--   * Drops the six client write policies (insert / update / delete on each table).
--   * Revokes INSERT, UPDATE and DELETE on both tables from anon, authenticated and PUBLIC
--     (defence in depth: with RLS on, a table with no write policy is already default-deny, but
--     the grant would turn into live access the moment anyone added a policy by mistake).
--   * Keeps the two SELECT policies and the SELECT grant: the Staff screen still reads roles and
--     assignments directly.
--
-- UNAFFECTED
--   * pet_save_role, pet_delete_role, pet_set_staff_role (102): SECURITY DEFINER, owned by the
--     table owner; the tables do not FORCE row level security (checked live), so the owner's
--     writes still work.
--   * The audit triggers from 087 (SECURITY DEFINER) keep recording role changes.
--   * Salon and Auto objects: nothing outside pet_roles / pet_staff_roles is touched.
--
-- HONEST LIMITS
--   * This closes the escalation path (a staff device making itself an admin role). It does not
--     identify which staff member acts and does not enforce per-feature permissions: that is the
--     later Phase 7 work (per-staff identity).
--   * A role's PERMISSIONS stay advisory until the features that should obey them check them.
--
-- ROLLBACK (restores exactly the previous state):
--   grant insert, update, delete on public.pet_roles, public.pet_staff_roles to authenticated;
--   create policy "pet_roles_insert_own_salon" on public.pet_roles for insert to authenticated
--     with check (salon_id = auth_salon_id());
--   create policy "pet_roles_update_own_salon" on public.pet_roles for update to authenticated
--     using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());
--   create policy "pet_roles_delete_own_salon" on public.pet_roles for delete to authenticated
--     using (salon_id = auth_salon_id());
--   create policy "pet_staff_roles_insert_own_salon" on public.pet_staff_roles for insert to authenticated
--     with check (salon_id = auth_salon_id()
--       and exists (select 1 from public.staff s where s.id = staff_id and s.salon_id = auth_salon_id())
--       and exists (select 1 from public.pet_roles r where r.id = role_id and r.salon_id = auth_salon_id()));
--   create policy "pet_staff_roles_update_own_salon" on public.pet_staff_roles for update to authenticated
--     using (salon_id = auth_salon_id())
--     with check (salon_id = auth_salon_id()
--       and exists (select 1 from public.staff s where s.id = staff_id and s.salon_id = auth_salon_id())
--       and exists (select 1 from public.pet_roles r where r.id = role_id and r.salon_id = auth_salon_id()));
--   create policy "pet_staff_roles_delete_own_salon" on public.pet_staff_roles for delete to authenticated
--     using (salon_id = auth_salon_id());

do $$
begin
  if to_regprocedure('public.pet_save_role(text, uuid, text, text, jsonb)') is null
     or to_regprocedure('public.pet_delete_role(text, uuid)') is null
     or to_regprocedure('public.pet_set_staff_role(text, uuid, uuid)') is null then
    raise exception '103 refused: apply 102 first (the admin-PIN replacement functions are missing)';
  end if;
end $$;

drop policy if exists "pet_roles_insert_own_salon" on public.pet_roles;
drop policy if exists "pet_roles_update_own_salon" on public.pet_roles;
drop policy if exists "pet_roles_delete_own_salon" on public.pet_roles;
drop policy if exists "pet_staff_roles_insert_own_salon" on public.pet_staff_roles;
drop policy if exists "pet_staff_roles_update_own_salon" on public.pet_staff_roles;
drop policy if exists "pet_staff_roles_delete_own_salon" on public.pet_staff_roles;

revoke insert, update, delete on public.pet_roles from public, anon, authenticated;
revoke insert, update, delete on public.pet_staff_roles from public, anon, authenticated;
