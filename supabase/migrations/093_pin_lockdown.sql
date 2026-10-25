-- 093_pin_lockdown.sql
--
-- Salon PIN hardening, part 2 of 2: remove the old unconditional PIN-change path.
--
-- STATUS: APPLIED to production 2026-10-25 on the owner's explicit instruction.
-- Release conditions as written were: (1) 091 applied and the client PR deployed -- MET; and
-- (2) the owner completes a REAL forgot-PIN recovery through the new path -- NOT VERIFIED at the
-- time of applying (production logs showed no calls to the new functions since the deploy). The
-- owner accepted that; this migration is fully reversible (see ROLLBACK) and super-admin PIN
-- reset (super_admin_reset_salon_pin) remains as a human fallback.
-- Verified live after applying: update_salon_pin refused for authenticated and anon (an impersonated
-- device account got "permission denied for function update_salon_pin"); salon_pins has RLS on,
-- no policies, no table privileges; change_salon_pins, reset_salon_admin_pin_via_recovery,
-- verify_staff_pin and super_admin_reset_salon_pin all still executable; sign-in RPCs returning 200.
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
    raise exception '093 refused: apply 091 first (replacement functions are missing)';
  end if;
end $$;

revoke execute on function public.update_salon_pin(text, text) from public, anon, authenticated;

drop policy if exists salon_pins_select_own_salon on public.salon_pins;
drop policy if exists salon_pins_update_own_salon on public.salon_pins;
