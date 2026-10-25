-- supabase/tests/091_pin_step_up.sql
-- STAGING ONLY. Needs 091 applied and staging to mirror production's PIN functions
-- (verify_staff_pin, update_salon_pin, check_pin_lockout) and its revoked salon_pins grants.
-- Self-cleaning: raises its results so the transaction rolls back. Expected FAILED=0.
-- A NULL outcome counts as a failure (ok is not true).

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

do $$
declare
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid();
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid();
  pw1 jsonb; pw2 jsonb; otp1 jsonb; otp_old jsonb; noamr1 jsonb;
  n text; fails int; i int;
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;

  insert into salons(id,name,slug,business_type) values (s1,'S1','s1','salon'),(s2,'S2','s2','salon');
  insert into auth.users(id,instance_id,aud,role,email) values
    (d1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',d1||'@t.invalid'),
    (d2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',d2||'@t.invalid');
  insert into salon_auth_users(id,salon_id) values (d1,s1),(d2,s2);
  insert into salon_pins(role,pin_hash,hash_version,salon_id) values
    ('staff',crypt('1111',gen_salt('bf',10)),'bcrypt',s1),('admin',crypt('9999',gen_salt('bf',10)),'bcrypt',s1),
    ('staff',crypt('2222',gen_salt('bf',10)),'bcrypt',s2),('admin',crypt('8888',gen_salt('bf',10)),'bcrypt',s2);

  -- device session (password) vs email-link session (otp) for the SAME user, as production has it
  pw1     := jsonb_build_object('sub',d1,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)));
  pw2     := jsonb_build_object('sub',d2,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)));
  otp1    := jsonb_build_object('sub',d1,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now())::bigint - 120)));
  otp_old := jsonb_build_object('sub',d1,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now())::bigint - 7200)));
  noamr1  := jsonb_build_object('sub',d1,'role','authenticated');

  -- ---- baseline facts that justify the fix
  insert into t_res select 'authenticated has no table access to salon_pins (policies inert)', pg_temp.as_claims(pw1,'authenticated','select count(*) from salon_pins') like 'ERR:%permission denied%', null;
  insert into t_res select 'THE HOLE (pre-092): a staff-PIN device can set the ADMIN PIN via the old function', pg_temp.as_claims(pw1,'authenticated','select update_salon_pin(''admin'',''0420'')::text') is not null
     and pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''admin'',''0420'')::text')='true', null;
  perform pg_temp.as_claims(pw1,'authenticated','select update_salon_pin(''admin'',''9999'')::text');   -- put it back

  -- ---- change_salon_pins: the step-up
  insert into t_res select 'anon cannot call change_salon_pins', pg_temp.as_claims('{"role":"anon"}','anon','select change_salon_pins(''9999'',''3333'')::text') like 'ERR:%permission denied%', null;
  n := pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(null,null,''0420'')::text');
  insert into t_res select 'ATTACK: no current PIN -> admin PIN change refused', n = 'false', n;
  n := pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''1111'',null,''0420'')::text');
  insert into t_res select 'ATTACK: STAFF PIN offered as current PIN -> refused', n = 'false', n;
  insert into t_res select 'refused attempts changed nothing (admin PIN still 9999)', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''admin'',''9999'')::text')='true', null;
  n := pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''9999'')::text');
  insert into t_res select 'nothing to change is refused', n like 'ERR:%Nothing to change%', n;
  insert into t_res select 'bad format refused (3 digits)', pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''9999'',''123'')::text') like 'ERR:%4-6 digits%', null;
  insert into t_res select 'bad format refused (letters)', pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''9999'',null,''abcd'')::text') like 'ERR:%4-6 digits%', null;
  insert into t_res select 'same staff and admin PIN refused', pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''9999'',''5555'',''5555'')::text') like 'ERR:%different%', null;
  insert into t_res select 'a wrong proof IS recorded (1 attempt); invalid input is not', (select count(*) from pin_login_attempts where salon_id=s1 and not success) = 1, (select count(*) from pin_login_attempts where salon_id=s1 and not success)::text;

  n := pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''9999'',''3333'')::text');
  insert into t_res select 'correct admin PIN: staff PIN changes', n = 'true' and pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''staff'',''3333'')::text')='true', n;
  insert into t_res select 'old staff PIN no longer works', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''staff'',''1111'')::text')='false', null;
  insert into t_res select 'admin PIN untouched when only staff changed', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''admin'',''9999'')::text')='true', null;
  n := pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''9999'',''4444'',''7777'')::text');
  insert into t_res select 'both PINs change atomically in one call', n = 'true' and pg_temp.as_claims(pw1,'authenticated','select (verify_staff_pin(''staff'',''4444'') and verify_staff_pin(''admin'',''7777''))::text')='true', n;
  insert into t_res select 'after an admin change the OLD admin PIN is rejected as the proof', pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''9999'',''5555'')::text') = 'false', null;
  insert into t_res select 'atomic: the rejected call changed neither PIN', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''staff'',''4444'')::text')='true', null;

  -- ---- tenant isolation
  n := pg_temp.as_claims(pw2,'authenticated','select change_salon_pins(''8888'',''6666'')::text');
  insert into t_res select 'other business can change ITS OWN PIN with its own admin PIN', n = 'true' and pg_temp.as_claims(pw2,'authenticated','select verify_staff_pin(''staff'',''6666'')::text')='true', n;
  insert into t_res select 'business 1 PINs unaffected by business 2 change', pg_temp.as_claims(pw1,'authenticated','select (verify_staff_pin(''staff'',''4444'') and verify_staff_pin(''admin'',''7777''))::text')='true', null;
  insert into t_res select 'business 2 cannot use business 1 admin PIN as proof', pg_temp.as_claims(pw2,'authenticated','select change_salon_pins(''7777'',''1212'')::text') = 'false', null;

  -- ---- lockout is inherited (5 failures / 15 min, same counter as login)
  for i in 1..5 loop perform pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''0000'',''1357'')::text'); end loop;
  n := pg_temp.as_claims(pw1,'authenticated','select change_salon_pins(''7777'',''1357'')::text');
  insert into t_res select 'after 5 wrong proofs even the CORRECT admin PIN is locked out', n = 'false', n;
  insert into t_res select 'the lockout really recorded 5+ failures (not rolled back)', (select count(*) from pin_login_attempts where salon_id=s1 and not success) >= 5, (select count(*) from pin_login_attempts where salon_id=s1 and not success)::text;
  insert into t_res select 'the locked-out call changed nothing (staff PIN still 4444)', (select crypt('4444', pin_hash) = pin_hash from salon_pins where salon_id=s1 and role='staff'), null;
  insert into t_res select 'brute force on one business does not lock another', pg_temp.as_claims(pw2,'authenticated','select change_salon_pins(''8888'',''2468'')::text') = 'true'
     and pg_temp.as_claims(pw2,'authenticated','select verify_staff_pin(''staff'',''2468'')::text')='true', null;
  delete from pin_login_attempts where salon_id=s1;

  -- ---- reset_salon_admin_pin_via_recovery
  n := pg_temp.as_claims(pw1,'authenticated','select reset_salon_admin_pin_via_recovery(''0420'')::text');
  insert into t_res select 'ATTACK: device (password) session cannot use the recovery function', n like 'ERR:%recent recovery email link%', n;
  n := pg_temp.as_claims(noamr1,'authenticated','select reset_salon_admin_pin_via_recovery(''0420'')::text');
  insert into t_res select 'session with no amr claim is refused (fails closed)', n like 'ERR:%recent recovery email link%', n;
  n := pg_temp.as_claims(otp_old,'authenticated','select reset_salon_admin_pin_via_recovery(''0420'')::text');
  insert into t_res select 'email-link session older than 1 hour is refused', n like 'ERR:%recent recovery email link%', n;
  insert into t_res select 'refused recovery attempts changed nothing', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''admin'',''7777'')::text')='true', null;
  insert into t_res select 'bad PIN format refused even with a valid email-link session', pg_temp.as_claims(otp1,'authenticated','select reset_salon_admin_pin_via_recovery(''12'')::text') like 'ERR:%4-6 digits%', null;
  insert into t_res select 'anon cannot call the recovery function', pg_temp.as_claims('{"role":"anon"}','anon','select reset_salon_admin_pin_via_recovery(''0420'')::text') like 'ERR:%permission denied%', null;
  n := pg_temp.as_claims(otp1,'authenticated','select reset_salon_admin_pin_via_recovery(''0420'')::text');
  insert into t_res select 'recent email-link session CAN reset the admin PIN (owner recovery works)', n is not null and n not like 'ERR:%' and pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''admin'',''0420'')::text')='true', n;
  insert into t_res select 'recovery sets ADMIN only: staff PIN unchanged', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''staff'',''4444'')::text')='true', null;
  insert into t_res select 'recovery for business 1 did not touch business 2', pg_temp.as_claims(pw2,'authenticated','select verify_staff_pin(''admin'',''8888'')::text')='true', null;

  -- ---- regressions on untouched machinery
  insert into t_res select 'REGRESSION: login-style verify_staff_pin still works', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''staff'',''4444'')::text')='true', null;
  insert into t_res select 'REGRESSION: wrong PIN still false', pg_temp.as_claims(pw1,'authenticated','select verify_staff_pin(''staff'',''0001'')::text')='false', null;
  insert into t_res select 'REGRESSION: super-admin reset still works', pg_temp.as_claims(jsonb_build_object('sub',d1,'role','authenticated','app_metadata',jsonb_build_object('is_super_admin',true)),'authenticated',format('select super_admin_reset_salon_pin(%L,''staff'',''3141'')::text',s2)) is not null
     and pg_temp.as_claims(pw2,'authenticated','select verify_staff_pin(''staff'',''3141'')::text')='true', null;
  insert into t_res select 'REGRESSION: super-admin reset refused without the claim', pg_temp.as_claims(pw1,'authenticated',format('select super_admin_reset_salon_pin(%L,''staff'',''3141'')::text',s2)) like 'ERR:%Access denied%', null;

  select count(*) filter (where ok is not true) into fails from t_res;
  raise exception 'RESULTS: FAILED=% TOTAL=% FAILED_TESTS=%', fails, (select count(*) from t_res), (select coalesce(jsonb_agg(name||' => '||coalesce(got,'')) filter (where ok is not true),'[]'::jsonb) from t_res);
end $$;
