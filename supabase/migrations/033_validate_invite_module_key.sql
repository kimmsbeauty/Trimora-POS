-- 033_validate_invite_module_key.sql
--
-- Applied live via Supabase MCP on 2026-07-11, reconciled here.
--
-- validate_invite() previously returned {valid, email, salon_name} only
-- -- OnboardingPage.jsx had no way to know an invite was tagged
-- module_key='auto' (migration 031), so every invite rendered the same
-- salon gold/black theme and "Set up your salon" copy regardless of
-- what was actually being onboarded. Confirmed live with a real,
-- unused 'auto'-tagged invite before this was written up: the frontend
-- was always in the dark about module_key.
--
-- Minimal, additive change -- one more field on the returned JSON, no
-- search_path/pgcrypto involvement (this function does no PIN/crypto
-- work, unlike the functions this session broke earlier), no signature
-- change, so no overload-collision risk either.

CREATE OR REPLACE FUNCTION public.validate_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_invite salon_invites%rowtype;
begin
  select * into v_invite
  from salon_invites
  where token = p_token
    and used = false
    and expires_at > now();

  if not found then
    return json_build_object('valid', false);
  end if;

  return json_build_object(
    'valid',      true,
    'email',      v_invite.email,
    'salon_name', v_invite.salon_name,
    'module_key', v_invite.module_key
  );
end;
$function$;
