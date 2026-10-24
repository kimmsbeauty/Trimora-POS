-- 091_pin_lockdown.sql
--
-- Salon PIN hardening, part 2 of 2: remove the old unconditional PIN-change path.
--
-- STATUS: HELD. Do NOT apply until BOTH are true:
--   1. 090 is applied and the PR that switches the clients to change_salon_pins /
--      reset_salon_admin_pin_via_recovery is deployed to production, and
--   2. the owner has completed a REAL forgot-PIN recovery (email link) end to end and confirmed it
--      worked through the new function. The reset pages carry a fallback to the old function
--      until then; applying 091 removes that safety net, so a recovery that only ever worked via
--      the fallback would break.
--
-- WHAT IT DOES
--   * Revokes EXECUTE on update_salon_pin(text, text) from anon and authenticated. After this,
--     no signed-in device can set a PIN without proof (current admin PIN, or a recent email link).
--   * Drops the two client RLS policies on salon_pins. They are inert today (`authenticated` has
--     no table privileges, verified live) but would become live, exploitable access the moment
--     anyone granted table privileges by mistake. Removing them is defence in depth.
--
-- UNAFFECTED (all SECURITY DEFINER, run as the owner, do not use the dropped policies or the
-- revoked execute): verify_staff_pin, verify_pin_for_device_login, complete_salon_onboarding,
-- super_admin_reset_salon_pin, the device/Edge Function logins.
--
-- ROLLBACK (restores exactly the previous state):
--   grant execute on function public.update_salon_pin(text, text) to anon, authenticated;
--   create policy salon_pins_select_own_salon on public.salon_pins for select to authenticated
--     using (salon_id = auth_salon_id());
--   create policy salon_pins_update_own_salon on public.salon_pins for update to authenticated
--     using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

do $$
begin
  if to_regprocedure('public.change_salon_pins(text, text, text)') is null
     or to_regprocedure('public.reset_salon_admin_pin_via_recovery(text)') is null then
    raise exception '091 refused: apply 090 first (replacement functions are missing)';
  end if;
end $$;

revoke execute on function public.update_salon_pin(text, text) from public, anon, authenticated;

drop policy if exists salon_pins_select_own_salon on public.salon_pins;
drop policy if exists salon_pins_update_own_salon on public.salon_pins;
