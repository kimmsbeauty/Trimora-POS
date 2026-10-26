-- supabase/tests/102_pet_role_admin_step_up.sql
-- NOT FOR PRODUCTION. Needs 102 applied on a database that mirrors production's PIN functions
-- (verify_staff_pin, check_pin_lockout, auth_salon_id), pet_roles / pet_staff_roles (086) and the
-- open client write policies. Self-cleaning: the final RAISE rolls everything back.
-- Expected: FAILED=0. A NULL outcome counts as a failure (ok is not true).

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
  st1 uuid := gen_random_uuid(); st1b uuid := gen_random_uuid(); st2 uuid := gen_random_uuid();
  c1 jsonb; c2 jsonb;
  n text; rid uuid; rid2 uuid; other_rid uuid; i int; fails int;
  full_perms text := '{"manage_bookings":true,"manage_staff_roles":true}';
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;

  insert into salons(id,name,slug,business_type) values (s1,'S1','s1','pet'),(s2,'S2','s2','pet');
  insert into auth.users(id) values (d1),(d2);
  insert into salon_auth_users(id,salon_id) values (d1,s1),(d2,s2);
  insert into salon_pins(role,pin_hash,hash_version,salon_id) values
    ('staff',crypt('1111',gen_salt('bf',10)),'bcrypt',s1),('admin',crypt('9999',gen_salt('bf',10)),'bcrypt',s1),
    ('staff',crypt('2222',gen_salt('bf',10)),'bcrypt',s2),('admin',crypt('8888',gen_salt('bf',10)),'bcrypt',s2);
  insert into staff(id,name,salon_id) values (st1,'A',s1),(st1b,'B',s1),(st2,'C',s2);
  c1 := jsonb_build_object('sub',d1,'role','authenticated');
  c2 := jsonb_build_object('sub',d2,'role','authenticated');

  -- ---- baseline (informational): is the open direct-write path still there? True before 103, false after.
  n := pg_temp.as_claims(c1,'authenticated','insert into pet_roles(salon_id,name,permissions) values ('''||s1||''',''Sneaky'','''||full_perms||'''::jsonb) returning id::text');
  insert into t_res select 'baseline: direct write path is ' || case when n like 'ERR:%' then 'CLOSED (103 applied)' else 'OPEN (until 103)' end, true, n;
  delete from pet_roles where salon_id = s1;

  -- ---- grants
  insert into t_res select 'anon cannot call pet_save_role', pg_temp.as_claims('{"role":"anon"}','anon','select pet_save_role(''9999'',null,''X'',null,''{}''::jsonb)::text') like 'ERR:%permission denied%', null;
  insert into t_res select 'anon cannot call pet_delete_role', pg_temp.as_claims('{"role":"anon"}','anon','select pet_delete_role(''9999'',gen_random_uuid())::text') like 'ERR:%permission denied%', null;
  insert into t_res select 'anon cannot call pet_set_staff_role', pg_temp.as_claims('{"role":"anon"}','anon','select pet_set_staff_role(''9999'',gen_random_uuid(),null)::text') like 'ERR:%permission denied%', null;
  n := pg_temp.as_claims(('{"role":"authenticated","sub":"'||gen_random_uuid()||'"}')::jsonb,'authenticated','select pet_save_role(''9999'',null,''X'',null,''{}''::jsonb)::text');
  insert into t_res select 'a session with no business is refused', n like 'ERR:Not signed in%', n;

  -- ---- pet_save_role: step-up
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(null,null,''Mgr'',null,'''||full_perms||'''::jsonb)::text');
  insert into t_res select 'ATTACK: no PIN -> no role created', n is null and not exists (select 1 from pet_roles where salon_id=s1), coalesce(n,'null');
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''1111'',null,''Mgr'',null,'''||full_perms||'''::jsonb)::text');
  insert into t_res select 'ATTACK: STAFF PIN is not the admin proof -> no role created', n is null and not exists (select 1 from pet_roles where salon_id=s1), coalesce(n,'null');
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'',null,''Mgr'',null,'''||full_perms||'''::jsonb)::text');
  insert into t_res select 'wrong PIN -> null, no role created', n is null and not exists (select 1 from pet_roles where salon_id=s1), coalesce(n,'null');
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''9999'',null,''  Mgr  '',''  desc  '','''||full_perms||'''::jsonb)::text');
  rid := n::uuid;
  insert into t_res select 'admin PIN creates the role (name and description trimmed)', exists (select 1 from pet_roles where id=rid and salon_id=s1 and name='Mgr' and description='desc' and (permissions->>'manage_staff_roles')::boolean), n;

  -- ---- lockout still works through these functions (5 wrong attempts, then even the right PIN is refused)
  delete from pin_login_attempts where salon_id = s1;
  for i in 1..5 loop
    perform pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'',null,''Zed'',null,''{}''::jsonb)::text');
  end loop;
  insert into t_res select 'failed attempts are recorded (not rolled back by the function)', (select count(*) from pin_login_attempts where salon_id=s1 and role='admin' and success=false) = 5, (select count(*)::text from pin_login_attempts where salon_id=s1 and role='admin' and success=false);
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''9999'',null,''Zed'',null,''{}''::jsonb)::text');
  insert into t_res select 'locked out: even the right admin PIN is refused for 15 minutes', n is null and not exists (select 1 from pet_roles where salon_id=s1 and name='Zed'), coalesce(n,'null');
  delete from pin_login_attempts where salon_id = s1;

  -- ---- validation (raises BEFORE any PIN attempt is counted)
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'',null,''   '',null,''{}''::jsonb)::text');
  insert into t_res select 'blank name rejected before the PIN is tried', n like 'ERR:Role name is required%' and not exists (select 1 from pin_login_attempts where salon_id=s1), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'',null,'''||repeat('x',61)||''',null,''{}''::jsonb)::text');
  insert into t_res select 'name over 60 chars rejected', n like 'ERR:%60 characters%', n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'',null,''Ok'','''||repeat('x',301)||''',''{}''::jsonb)::text');
  insert into t_res select 'description over 300 chars rejected', n like 'ERR:%300 characters%', n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'',null,''Ok'',null,''{"a":"yes"}''::jsonb)::text');
  insert into t_res select 'non-boolean permission values rejected', n like 'ERR:Permissions must be%', n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'',null,''Ok'',null,''[1]''::jsonb)::text');
  insert into t_res select 'permissions must be an object', n like 'ERR:Permissions must be%', n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'',null,''mgr'',null,''{}''::jsonb)::text');
  insert into t_res select 'duplicate name (case-insensitive) rejected before the PIN is tried', n like 'ERR:A role with that name already exists%' and not exists (select 1 from pin_login_attempts where salon_id=s1), n;

  -- ---- update path
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''0000'','''||rid||''',''Mgr2'',null,''{}''::jsonb)::text');
  insert into t_res select 'ATTACK: wrong PIN cannot edit a role (e.g. strip admin rights)', n is null and (select name from pet_roles where id=rid)='Mgr', coalesce(n,'null');
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''9999'','''||rid||''',''Mgr2'',null,''{"manage_bookings":true}''::jsonb)::text');
  insert into t_res select 'admin PIN edits the role', n = rid::text and (select name from pet_roles where id=rid)='Mgr2' and not coalesce((select (permissions->>'manage_staff_roles')::boolean from pet_roles where id=rid),false), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''9999'','''||rid||''',''Mgr2'',''same name, same role'',''{}''::jsonb)::text');
  insert into t_res select 'renaming a role to its own name is not a duplicate', n = rid::text, n;

  -- ---- tenant isolation
  delete from pin_login_attempts where salon_id = s1;   -- sections must not trip each other's lockout
  insert into pet_roles(salon_id,name,permissions) values (s2,'Other','{}') returning id into other_rid;
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''9999'','''||other_rid||''',''Hijack'',null,''{}''::jsonb)::text');
  insert into t_res select 'cannot edit another business''s role', n like 'ERR:Role not found%' and (select name from pet_roles where id=other_rid)='Other', n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_delete_role(''9999'','''||other_rid||''')::text');
  insert into t_res select 'cannot delete another business''s role', n like 'ERR:Role not found%' and exists (select 1 from pet_roles where id=other_rid), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''9999'','''||st2||''','''||rid||''')::text');
  insert into t_res select 'cannot assign another business''s staff member', n like 'ERR:Staff member not found%' and not exists (select 1 from pet_staff_roles where staff_id=st2), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''9999'','''||st1||''','''||other_rid||''')::text');
  insert into t_res select 'cannot assign another business''s role', n like 'ERR:Role not found%' and not exists (select 1 from pet_staff_roles where staff_id=st1), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''8888'','''||st1||''','''||rid||''')::text');   -- business 2's admin PIN
  insert into t_res select 'another business''s admin PIN is not a proof for this business', n = 'false' and not exists (select 1 from pet_staff_roles where staff_id=st1), n;

  -- ---- pet_set_staff_role
  delete from pin_login_attempts where salon_id = s1;   -- sections must not trip each other's lockout
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''1111'','''||st1||''','''||rid||''')::text');
  insert into t_res select 'ATTACK: staff PIN cannot assign a role (self-promotion)', n = 'false' and not exists (select 1 from pet_staff_roles where staff_id=st1), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''9999'','''||st1||''','''||rid||''')::text');
  insert into t_res select 'admin PIN assigns a role', n = 'true' and exists (select 1 from pet_staff_roles where staff_id=st1 and role_id=rid and salon_id=s1), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''9999'',null,''Groomer'',null,''{"manage_bookings":true}''::jsonb)::text');
  rid2 := n::uuid;
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''9999'','''||st1||''','''||rid2||''')::text');
  insert into t_res select 're-assigning replaces the assignment (one role per staff member)', n = 'true' and (select count(*) from pet_staff_roles where staff_id=st1)=1 and exists (select 1 from pet_staff_roles where staff_id=st1 and role_id=rid2), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''0000'','''||st1||''',null)::text');
  insert into t_res select 'wrong PIN cannot unassign', n = 'false' and exists (select 1 from pet_staff_roles where staff_id=st1), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''9999'','''||st1||''',null)::text');
  insert into t_res select 'admin PIN unassigns (role null)', n = 'true' and not exists (select 1 from pet_staff_roles where staff_id=st1), n;

  -- ---- pet_delete_role
  delete from pin_login_attempts where salon_id = s1;   -- sections must not trip each other's lockout
  perform pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''9999'','''||st1b||''','''||rid2||''')::text');
  n := pg_temp.as_claims(c1,'authenticated','select pet_delete_role(''9999'','''||rid2||''')::text');
  insert into t_res select 'a role assigned to staff cannot be deleted', n like 'ERR:This role is assigned%' and exists (select 1 from pet_roles where id=rid2), n;
  perform pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''9999'','''||st1b||''',null)::text');
  n := pg_temp.as_claims(c1,'authenticated','select pet_delete_role(''0000'','''||rid2||''')::text');
  insert into t_res select 'ATTACK: wrong PIN cannot delete a role', n = 'false' and exists (select 1 from pet_roles where id=rid2), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_delete_role(''9999'','''||rid2||''')::text');
  insert into t_res select 'admin PIN deletes an unassigned role', n = 'true' and not exists (select 1 from pet_roles where id=rid2), n;

  select count(*) into fails from t_res where ok is not true;
  for n in select format('%s  %s%s', case when ok is true then 'PASS' else 'FAIL' end, name, case when ok is true then '' else '  [got: '||coalesce(got,'null')||']' end) from t_res loop
    raise notice '%', n;
  end loop;
  raise exception 'FAILED=% of % (rolled back)', fails, (select count(*) from t_res);
end $$;
