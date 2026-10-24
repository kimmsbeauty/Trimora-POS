-- 090_pin_step_up.sql
--
-- Salon PIN hardening, part 1 of 2: two NEW functions that put a proof requirement in front of
-- PIN changes. ADDITIVE ONLY: no existing function, table, policy or grant is altered.
-- Migration 091 (held) later removes the old unconditional path.
--
-- THE PROBLEM (verified against the live project, 2026-10-24)
--   update_salon_pin(p_role, p_new_pin) is SECURITY DEFINER and keys off auth_salon_id() only.
--   Every signed-in device of a business holds a token that can call it -- including a device
--   signed in with the STAFF PIN -- and it will set the ADMIN PIN with no proof of anything.
--   (The salon_pins table itself is NOT exposed: `authenticated` has no table privileges and the
--   two client RLS policies are inert. Only the function is the hole.)
--
-- THE FIX
--   change_salon_pins(current_admin_pin, new_staff_pin?, new_admin_pin?) returns boolean
--       true = changed; false = wrong admin PIN (an attempt is recorded and counts toward the
--       lockout); validation problems raise. Used by the Salon and Auto Settings pages. Requires the CURRENT ADMIN PIN, checked with
--       the existing verify_staff_pin() (bcrypt + the existing 5-failures/15-minutes lockout).
--       One atomic call: both PINs change together or neither does. (The old UI sent two
--       parallel calls; with a step-up check the second would race the first.)
--   reset_salon_admin_pin_via_recovery(new_pin)
--       Used by the forgot-PIN pages, where the owner by definition does not know the current
--       PIN. Requires the session to have been started by an EMAIL LINK: the JWT's amr claim must
--       contain method 'otp' issued within the last hour (the reset link's lifetime). Device
--       logins use grant_type=password (method 'password') and nothing else in this codebase
--       mints OTP sessions, so a staff device cannot satisfy it. Sets the ADMIN PIN only.
--       Evidence: auth.mfa_amr_claims in production holds 'password' (device logins) and 'otp'
--       (email-link sessions) only.
--
-- NOT TOUCHED: update_salon_pin, verify_staff_pin, verify_pin_for_device_login,
-- super_admin_reset_salon_pin, complete_salon_onboarding, the lockout function, pgcrypto.
--
-- STATUS: written for owner review; tested on the staging project (see supabase/tests/
-- 090_pin_step_up.sql). NOT applied to production.
--
-- KNOWN LIMITS
--   * The recovery check relies on the amr claim. It is verified against production's recorded
--     session methods but NOT end-to-end with a real recovery email (that needs a mailbox). The
--     reset pages therefore keep a fallback to the old function until 091 ships.
--   * Failed "current admin PIN" attempts count toward the same lockout as admin login (same
--     verify_staff_pin counter). A bad actor on a staff device could already lock the admin out
--     for 15 minutes by guessing at login; this adds no new capability.
--   * New PINs are not compared with the other role's EXISTING PIN (the UI only compares the two
--     typed in one save). Unchanged behaviour, out of scope.
--
-- ROLLBACK (the old path is untouched, so nothing depends on these yet):
--   drop function if exists public.change_salon_pins(text, text, text);
--   drop function if exists public.reset_salon_admin_pin_via_recovery(text);

create or replace function public.change_salon_pins(
  p_current_admin_pin text,
  p_new_staff_pin     text default null,
  p_new_admin_pin     text default null
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

  if p_new_staff_pin is null and p_new_admin_pin is null then
    raise exception 'Nothing to change';
  end if;
  if p_new_staff_pin is not null and p_new_staff_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4-6 digits';
  end if;
  if p_new_admin_pin is not null and p_new_admin_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4-6 digits';
  end if;
  if p_new_staff_pin is not null and p_new_admin_pin is not null and p_new_staff_pin = p_new_admin_pin then
    raise exception 'Staff and admin PINs must be different';
  end if;

  -- The step-up proof. verify_staff_pin() is the existing bcrypt check with lockout and
  -- attempt logging; it is SECURITY DEFINER and resolves the salon from the same session.
  -- A wrong proof RETURNS false instead of raising: raising would roll back the failed-attempt
  -- row verify_staff_pin just wrote and silently disable the lockout (caught by the tests).
  -- Every check that can raise runs BEFORE this point, so no attempt is lost to a rollback.
  if coalesce(p_current_admin_pin, '') = '' or not verify_staff_pin('admin', p_current_admin_pin) then
    return false;
  end if;

  if p_new_staff_pin is not null then
    update salon_pins
       set pin_hash = crypt(p_new_staff_pin, gen_salt('bf', 10)), hash_version = 'bcrypt'
     where salon_id = v_salon and role = 'staff';
    if not found then raise exception 'No staff PIN record found for this salon'; end if;
  end if;

  if p_new_admin_pin is not null then
    update salon_pins
       set pin_hash = crypt(p_new_admin_pin, gen_salt('bf', 10)), hash_version = 'bcrypt'
     where salon_id = v_salon and role = 'admin';
    if not found then raise exception 'No admin PIN record found for this salon'; end if;
  end if;

  return true;
end;
$$;

create or replace function public.reset_salon_admin_pin_via_recovery(p_new_pin text)
returns void
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

  if not exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) a
    where a ->> 'method' = 'otp'
      and (a ->> 'timestamp') ~ '^[0-9]+$'
      and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 3600
  ) then
    raise exception 'PIN reset requires a recent recovery email link';
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4-6 digits';
  end if;

  update salon_pins
     set pin_hash = crypt(p_new_pin, gen_salt('bf', 10)), hash_version = 'bcrypt'
   where salon_id = v_salon and role = 'admin';
  if not found then raise exception 'No admin PIN record found for this salon'; end if;
end;
$$;

-- This project's default privileges grant EXECUTE on new functions straight to anon and
-- authenticated (see README), so revoke by role, then grant only what is intended.
revoke execute on function public.change_salon_pins(text, text, text) from public, anon, authenticated;
revoke execute on function public.reset_salon_admin_pin_via_recovery(text) from public, anon, authenticated;
grant execute on function public.change_salon_pins(text, text, text) to authenticated;
grant execute on function public.reset_salon_admin_pin_via_recovery(text) to authenticated;
