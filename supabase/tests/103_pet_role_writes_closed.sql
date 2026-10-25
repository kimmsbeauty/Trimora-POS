-- supabase/tests/103_pet_role_writes_closed.sql
-- NOT FOR PRODUCTION. Needs 102 AND 103 applied on a database that mirrors production's PIN
-- functions and pet_roles / pet_staff_roles (086). Self-cleaning: the final RAISE rolls back.
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
  st1 uuid := gen_random_uuid();
  c1 jsonb; n text; rid uuid; fails int;
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;

  insert into salons(id,name,slug,business_type) values (s1,'S1','s1','pet'),(s2,'S2','s2','pet');
  insert into auth.users(id) values (d1),(d2);
  insert into salon_auth_users(id,salon_id) values (d1,s1),(d2,s2);
  insert into salon_pins(role,pin_hash,hash_version,salon_id) values
    ('staff',crypt('1111',gen_salt('bf',10)),'bcrypt',s1),('admin',crypt('9999',gen_salt('bf',10)),'bcrypt',s1),
    ('staff',crypt('2222',gen_salt('bf',10)),'bcrypt',s2),('admin',crypt('8888',gen_salt('bf',10)),'bcrypt',s2);
  insert into staff(id,name,salon_id) values (st1,'A',s1);
  c1 := jsonb_build_object('sub',d1,'role','authenticated');

  -- ---- the hole is closed: a staff-PIN device cannot write the tables directly
  n := pg_temp.as_claims(c1,'authenticated','insert into pet_roles(salon_id,name,permissions) values ('''||s1||''',''Sneaky'',''{"manage_staff_roles":true}''::jsonb)');
  insert into t_res select 'CLOSED: direct INSERT into pet_roles is refused', n like 'ERR:%permission denied%', n;
  n := pg_temp.as_claims(c1,'authenticated','insert into pet_staff_roles(salon_id,staff_id,role_id) values ('''||s1||''','''||st1||''',gen_random_uuid())');
  insert into t_res select 'CLOSED: direct INSERT into pet_staff_roles is refused', n like 'ERR:%permission denied%', n;

  -- through the admin-PIN functions it all still works
  n := pg_temp.as_claims(c1,'authenticated','select pet_save_role(''9999'',null,''Manager'',null,''{"manage_bookings":true}''::jsonb)::text');
  rid := n::uuid;
  insert into t_res select 'pet_save_role still creates a role (function writes as owner)', exists (select 1 from pet_roles where id=rid and salon_id=s1), n;
  n := pg_temp.as_claims(c1,'authenticated','select pet_set_staff_role(''9999'','''||st1||''','''||rid||''')::text');
  insert into t_res select 'pet_set_staff_role still assigns', n='true' and exists (select 1 from pet_staff_roles where staff_id=st1 and role_id=rid), n;

  -- direct UPDATE / DELETE of existing rows are refused and change nothing
  n := pg_temp.as_claims(c1,'authenticated','update pet_roles set permissions = ''{"manage_staff_roles":true}''::jsonb where id = '''||rid||'''');
  insert into t_res select 'CLOSED: direct UPDATE of pet_roles is refused', n like 'ERR:%permission denied%' and not coalesce((select (permissions->>'manage_staff_roles')::boolean from pet_roles where id=rid),false), n;
  n := pg_temp.as_claims(c1,'authenticated','delete from pet_roles where id = '''||rid||'''');
  insert into t_res select 'CLOSED: direct DELETE of pet_roles is refused', n like 'ERR:%permission denied%' and exists (select 1 from pet_roles where id=rid), n;
  n := pg_temp.as_claims(c1,'authenticated','update pet_staff_roles set role_id = gen_random_uuid() where staff_id = '''||st1||'''');
  insert into t_res select 'CLOSED: direct UPDATE of pet_staff_roles is refused', n like 'ERR:%permission denied%' and exists (select 1 from pet_staff_roles where staff_id=st1 and role_id=rid), n;
  n := pg_temp.as_claims(c1,'authenticated','delete from pet_staff_roles where staff_id = '''||st1||'''');
  insert into t_res select 'CLOSED: direct DELETE of pet_staff_roles is refused', n like 'ERR:%permission denied%' and exists (select 1 from pet_staff_roles where staff_id=st1), n;

  -- reads keep working, scoped to the business
  n := pg_temp.as_claims(c1,'authenticated','select count(*)::text from pet_roles');
  insert into t_res select 'SELECT still works and sees own business roles', n = '1', n;
  n := pg_temp.as_claims(c1,'authenticated','select count(*)::text from pet_staff_roles');
  insert into t_res select 'SELECT still works on assignments', n = '1', n;
  n := pg_temp.as_claims(jsonb_build_object('sub',d2,'role','authenticated'),'authenticated','select count(*)::text from pet_roles');
  insert into t_res select 'another business sees none of them', n = '0', n;

  -- anon has nothing
  n := pg_temp.as_claims('{"role":"anon"}','anon','select count(*)::text from pet_roles');
  insert into t_res select 'anon cannot read pet_roles', n like 'ERR:%permission denied%', n;
  n := pg_temp.as_claims('{"role":"anon"}','anon','insert into pet_roles(salon_id,name) values ('''||s1||''',''x'')');
  insert into t_res select 'anon cannot write pet_roles', n like 'ERR:%permission denied%', n;

  -- catalog facts
  insert into t_res select 'only the two SELECT policies remain', (select count(*) from pg_policies where schemaname='public' and tablename in ('pet_roles','pet_staff_roles'))=2
    and (select count(*) from pg_policies where schemaname='public' and tablename in ('pet_roles','pet_staff_roles') and cmd='SELECT')=2, null;
  insert into t_res select 'authenticated holds no write privilege on either table',
    not has_table_privilege('authenticated','public.pet_roles','insert,update,delete')
    and not has_table_privilege('authenticated','public.pet_staff_roles','insert,update,delete')
    and has_table_privilege('authenticated','public.pet_roles','select')
    and has_table_privilege('authenticated','public.pet_staff_roles','select'), null;

  select count(*) into fails from t_res where ok is not true;
  for n in select format('%s  %s%s', case when ok is true then 'PASS' else 'FAIL' end, name, case when ok is true then '' else '  [got: '||coalesce(got,'null')||']' end) from t_res loop
    raise notice '%', n;
  end loop;
  raise exception 'FAILED=% of % (rolled back)', fails, (select count(*) from t_res);
end $$;
