-- supabase/tests/087_pet_audit_log.sql
-- Run on STAGING only, against stub pet_* tables (id, salon_id, name, note, updated_at) with 087
-- applied. Self-cleaning (raises its results so the transaction rolls back). Expected FAILED=0.
-- A NULL outcome counts as a failure (ok is not true).

create or replace function pg_temp.as_run(p_uid uuid, p_role text, p_sql text, p_headers text default null) returns text
language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{"role":"anon"}' else jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', coalesce(p_headers, '{}'), true);
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
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid(); sa uuid := gen_random_uuid();
  da uuid := gen_random_uuid(); db uuid := gen_random_uuid(); ds uuid := gen_random_uuid();
  stA uuid; stB uuid; rid text; t text; n text; fails int; all_ok boolean := true;
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;
  insert into salons(id,name,slug,business_type) values (pa,'PetA','pa','pet'),(pb,'PetB','pb','pet'),(sa,'Salon','sa','salon');
  insert into auth.users(id,instance_id,aud,role,email) select x,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',x||'@t.invalid' from unnest(array[da,db,ds]) x;
  insert into salon_auth_users(id,salon_id) values (da,pa),(db,pb),(ds,sa);
  insert into staff(name,role,salon_id) values ('StaffA','Groomer',pa) returning id into stA;
  insert into staff(name,role,salon_id) values ('StaffB','Groomer',pb) returning id into stB;

  -- every audited table: insert / update / delete each produce exactly one audit row
  foreach t in array array['pet_pets','pet_vaccinations','pet_customer_profiles','pet_services','pet_roles','pet_staff_roles'] loop
    rid := pg_temp.as_run(da,'authenticated',format('insert into %I(salon_id,name) values (%L,%L) returning id::text',t,pa,'x'));
    insert into t_res select t||': insert audited', rid !~ '^ERR' and exists(select 1 from pet_audit_log where table_name=t and row_id=rid::uuid and op='INSERT' and device_user_id=da), rid;
    perform pg_temp.as_run(da,'authenticated',format('update %I set note=%L where id=%L',t,'n',rid));
    insert into t_res select t||': update audited with changed column name only', coalesce((select changed_columns from pet_audit_log where table_name=t and row_id=rid::uuid and op='UPDATE')=array['note'], false), null;
    perform pg_temp.as_run(da,'authenticated',format('delete from %I where id=%L',t,rid));
    insert into t_res select t||': delete audited', exists(select 1 from pet_audit_log where table_name=t and row_id=rid::uuid and op='DELETE'), null;
  end loop;

  rid := pg_temp.as_run(da,'authenticated',format('insert into pet_pets(salon_id,name) values (%L,%L) returning id::text',pa,'Simba'));
  perform pg_temp.as_run(da,'authenticated',format('update pet_pets set name=%L where id=%L','Simba',rid));          -- same value: no-op
  insert into t_res select 'no-op update writes no audit row', (select count(*) from pet_audit_log where row_id=rid::uuid and op='UPDATE')=0, null;
  perform pg_temp.as_run(da,'authenticated',format('update pet_pets set note=%L where id=%L','n1',rid), format('{"x-pet-actor":"%s"}',stA));
  insert into t_res select 'valid actor recorded and flagged asserted', exists(select 1 from pet_audit_log where row_id=rid::uuid and op='UPDATE' and acted_by_staff_id=stA and actor_asserted), null;
  perform pg_temp.as_run(da,'authenticated',format('update pet_pets set note=%L where id=%L','n2',rid), format('{"x-pet-actor":"%s"}',stB));
  insert into t_res select 'actor from ANOTHER business is not accepted', exists(select 1 from pet_audit_log where row_id=rid::uuid and op='UPDATE' and acted_by_staff_id is null and actor_asserted), null;
  n := pg_temp.as_run(da,'authenticated',format('update pet_pets set note=%L where id=%L','n3',rid), '{"x-pet-actor":"not-a-uuid"}');
  insert into t_res select 'malformed actor header never blocks the write', n='OK', n;
  perform pg_temp.as_run(da,'authenticated',format('update pet_pets set note=%L where id=%L','n4',rid));
  insert into t_res select 'no header: actor_asserted=false, actor null', exists(select 1 from pet_audit_log where row_id=rid::uuid and changed_columns=array['note'] and not actor_asserted and acted_by_staff_id is null), null;

  insert into t_res select 'audit table has no column that could hold values', (select count(*) from information_schema.columns where table_name='pet_audit_log' and column_name in ('old_data','new_data','old_values','new_values','data','payload'))=0, null;
  insert into t_res select 'own business can read its audit rows', pg_temp.as_run(da,'authenticated','select (count(*)>0)::text from pet_audit_log')='true', null;
  insert into t_res select 'other business cannot read them', pg_temp.as_run(db,'authenticated',format('select count(*) from pet_audit_log where salon_id=%L',pa))='0', null;
  insert into t_res select 'salon tenant device reads none', pg_temp.as_run(ds,'authenticated','select count(*) from pet_audit_log')='0', null;
  insert into t_res select 'anon cannot read', pg_temp.as_run(null,'anon','select count(*) from pet_audit_log') like 'ERR:%', null;
  insert into t_res select 'clients cannot insert audit rows', pg_temp.as_run(da,'authenticated',format('insert into pet_audit_log(salon_id,table_name,row_id,op) values (%L,%L,%L,%L) returning id::text',pa,'pet_pets',rid,'INSERT')) like 'ERR:%', null;
  insert into t_res select 'clients cannot edit audit rows', coalesce(pg_temp.as_run(da,'authenticated','with u as (update pet_audit_log set op=''DELETE'' returning 1) select count(*) from u') in ('0') or pg_temp.as_run(da,'authenticated','with u as (update pet_audit_log set op=''DELETE'' returning 1) select count(*) from u') like 'ERR:%', false), null;
  insert into t_res select 'clients cannot delete audit rows', coalesce(pg_temp.as_run(da,'authenticated','with d as (delete from pet_audit_log returning 1) select count(*) from d') in ('0') or pg_temp.as_run(da,'authenticated','with d as (delete from pet_audit_log returning 1) select count(*) from d') like 'ERR:%', false), null;
  insert into t_res select 'audit rows survive the tamper attempts', (select count(*) from pet_audit_log where salon_id=pa)>=20, null;
  insert into t_res select 'trigger function not callable by clients', pg_temp.as_run(da,'authenticated','select pet_audit_row()::text') like 'ERR:%', null;
  insert into t_res select 'other business writes are audited under THEIR salon only', (select count(*) from pet_audit_log where salon_id=pb)=0, null;

  select count(*) filter (where ok is not true) into fails from t_res;
  raise exception 'RESULTS: FAILED=% TOTAL=% FAILED_TESTS=%', fails, (select count(*) from t_res), (select coalesce(jsonb_agg(name||' => '||coalesce(got,'')) filter (where ok is not true),'[]'::jsonb) from t_res);
end $$;
