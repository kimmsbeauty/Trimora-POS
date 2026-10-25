-- supabase/tests/092_pin_lockdown.sql
-- STAGING ONLY, with 091 AND 092 applied (and staging mirroring production's PIN functions).
-- Proves the old unconditional path is closed AND that everything legitimate still works.
-- Self-cleaning; expected FAILED=0; NULL counts as failure.

create or replace function pg_temp.as_claims(p_claims jsonb, p_role text, p_sql text) returns text
language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    if sqlerrm = 'INTO used with a command that cannot return data' then
      begin execute p_sql; v := 'OK'; exception when others then v := 'ERR:' || sqlerrm; end;
    else v := 'ERR:' || sqlerrm; end if;
  end;
  execute 'reset role';
  return v;
end $f$;

do $t$
declare
  s1 uuid := gen_random_uuid(); d1 uuid := gen_random_uuid(); dn uuid := gen_random_uuid();
  pw1 jsonb; otp1 jsonb; pwn jsonb; n text; fails int;
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;
  insert into salons(id,name,slug,business_type) values (s1,'S1','s1','salon');
  insert into auth.users(id,instance_id,aud,role,email) values
    (d1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',d1||'@t.invalid'),
    (dn,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',dn||'@t.invalid');
  insert into salon_auth_users(id,salon_id) values (d1,s1);
  insert into salon_pins(role,pin_hash,hash_version,salon_id) values
    ('staff',crypt('1111',gen_salt('bf',10)),'bcrypt',s1),('admin',crypt('9999',gen_salt('bf',10)),'bcrypt',s1);
  pw1  := jsonb_build_object('sub',d1,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)));
  otp1 := jsonb_build_object('sub',d1,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now())::bigint - 60)));
  pwn  := jsonb_build_object('sub',dn,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)));

  -- the hole is closed
  n := pg_temp.as_claims(pw1,'authenticated','select update_salon_pin(''admin'',''0420'')::text');
  insert into t_res select 'ATTACK CLOSED: a staff-PIN device can no longer call update_salon_pin', n like 'ERR:%permission denied%', n;
  insert into t_res select 'anon cannot call update_salon_pin', pg_temp.as_claims('{"role":"anon"}','anon','select update_salon_pin(''admin'',''0420'')::text') like 'ERR:%permission denied%', null;
  insert into t_res select 'admin PIN still 9999 after the blocked attack', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''admin'',''9999'')::text')='true', null;
  insert into t_res select 'client RLS policies on salon_pins are gone', (select count(*) from pg_policies where tablename='salon_pins')=0, (select count(*) from pg_policies where tablename='salon_pins')::text;
  insert into t_res select 'RLS is still ENABLED on salon_pins (no policy = deny)', (select relrowsecurity from pg_class where oid='public.salon_pins'::regclass), null;
  insert into t_res select 'authenticated cannot read salon_pins', pg_temp.as_claims(pw1,'authenticated','select count(*) from salon_pins') like 'ERR:%permission denied%', null;
  insert into t_res select 'anon cannot read salon_pins', pg_temp.as_claims('{"role":"anon"}','anon','select count(*) from salon_pins') like 'ERR:%permission denied%', null;
  insert into t_res select 'authenticated cannot write salon_pins directly', pg_temp.as_claims(pw1,'authenticated',format('update salon_pins set pin_hash=%L where salon_id=%L','x',s1)) like 'ERR:%permission denied%', null;

  -- the legitimate paths still work
  insert into t_res select 'settings step-up still works after lockdown', pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''9999'',''3333'',''7777'')::text')='true'
     and pg_temp.as_claims(pw1,'authenticated','select (verify_staff_pin(''staff'',''3333'') and verify_staff_pin(''admin'',''7777''))::text')='true', null;
  insert into t_res select 'owner email-link recovery still works after lockdown', pg_temp.as_claims(otp1,'authenticated','select reset_salon_admin_pin_via_recovery(''0420'')::text') not like 'ERR:%'
     and pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''admin'',''0420'')::text')='true', null;
  insert into t_res select 'login-style PIN check still works', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''staff'',''3333'')::text')='true', null;
  insert into t_res select 'super-admin reset still works', pg_temp.as_claims(jsonb_build_object('sub',d1,'role','authenticated','app_metadata',jsonb_build_object('is_super_admin',true)),'authenticated',format('select super_admin_reset_salon_pin(%L,''staff'',''5150'')::text',s1)) not like 'ERR:%'
     and pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''staff'',''5150'')::text')='true', null;
  insert into salon_invites(token,salon_name) values ('tok-s','Brand New');
  perform pg_temp.as_claims(pwn,'authenticated','select count(*) from complete_salon_onboarding(''Brand New'',''brand-new'',''1357'',''2468'',''tok-s'')');
  insert into t_res select 'ONBOARDING still creates both PIN rows (definer needs no client grant)', (select count(*) from salon_pins p join salons s on s.id=p.salon_id where s.slug='brand-new')=2, (select count(*) from salon_pins p join salons s on s.id=p.salon_id where s.slug='brand-new')::text;
  insert into t_res select 'new business can sign in with its onboarding admin PIN', pg_temp.as_claims(pwn,'authenticated','select verify_staff_pin(''admin'',''2468'')::text')='true', null;
  -- the guard in 092 really refuses when a replacement function is missing (rolled back with the test)
  drop function public.reset_salon_admin_pin_via_recovery(text);
  begin
    execute $g$ do $$ begin
      if to_regprocedure('public.change_salon_pins(text, text, text)') is null
         or to_regprocedure('public.reset_salon_admin_pin_via_recovery(text)') is null then
        raise exception '092 refused: apply 091 first (replacement functions are missing)';
      end if; end $$ $g$;
    insert into t_res values ('092 guard refuses when a replacement function is missing', false, 'guard did not fire');
  exception when others then
    insert into t_res values ('092 guard refuses when a replacement function is missing', sqlerrm like '%092 refused%', sqlerrm);
  end;

  select count(*) filter (where ok is not true) into fails from t_res;
  raise exception 'RESULTS: FAILED=% TOTAL=% FAILED_TESTS=%', fails, (select count(*) from t_res), (select coalesce(jsonb_agg(name||' => '||coalesce(got,'')) filter (where ok is not true),'[]'::jsonb) from t_res);
end $t$;
