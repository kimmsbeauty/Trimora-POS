-- supabase/tests/089_pet_boarding.sql
-- Run on STAGING (or a throwaway database) only, with 087 and 089 applied and the real
-- salons / customers / staff / pet_pets / pet_services tables (or equivalent stubs with
-- the columns 089 reads). KNOWN ISSUE, not asserted here: deleting a whole business that has any
-- pet_* rows fails because 087's audit trigger logs the cascaded deletes against the business
-- being deleted (pre-existing, see migrations README). Self-cleaning: it raises its results so the transaction rolls
-- back. Expected FAILED=0. A NULL outcome counts as a failure (ok is not true).

create or replace function pg_temp.as_run(p_uid uuid, p_role text, p_sql text) returns text
language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{"role":"anon"}' else jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
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
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  da uuid := gen_random_uuid(); db uuid := gen_random_uuid();
  cA uuid; cA2 uuid; cB uuid; petA uuid; petA2 uuid; petA3 uuid; petB uuid;
  svcB uuid; svcG uuid; svcOff uuid; k1 uuid; k2 uuid; kB uuid; kM uuid;
  s1 text; s2 text; s3 text; r text; fails int;
  d0 date := date '2030-03-10';
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;
  insert into salons(id,name,slug,business_type) values (pa,'PetA','pa','pet'),(pb,'PetB','pb','pet');
  insert into auth.users(id,instance_id,aud,role,email) select x,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',x||'@t.invalid' from unnest(array[da,db]) x;
  insert into salon_auth_users(id,salon_id) values (da,pa),(db,pb);
  insert into customers(name,salon_id) values ('CustA',pa) returning id into cA;
  insert into customers(name,salon_id) values ('CustA2',pa) returning id into cA2;
  insert into customers(name,salon_id) values ('CustB',pb) returning id into cB;
  insert into pet_pets(salon_id,customer_id,name,species) values (pa,cA,'Rex','Dog') returning id into petA;
  insert into pet_pets(salon_id,customer_id,name,species) values (pa,cA,'Tom','Cat') returning id into petA3;
  insert into pet_pets(salon_id,customer_id,name,species) values (pa,cA2,'Zed','Dog') returning id into petA2;
  insert into pet_pets(salon_id,customer_id,name,species) values (pb,cB,'Bo','Dog') returning id into petB;
  insert into pet_services(salon_id,name,category,price,duration_minutes,active) values (pa,'Standard night','Boarding',900,null,true) returning id into svcB;
  insert into pet_services(salon_id,name,category,price,duration_minutes,active) values (pa,'Full groom','Grooming',2500,90,true) returning id into svcG;
  insert into pet_services(salon_id,name,category,price,duration_minutes,active) values (pa,'Old rate','Boarding',700,null,false) returning id into svcOff;

  -- ---- kennels ----
  k1 := pg_temp.as_run(da,'authenticated',format('select pet_save_kennel(null,%L,%L,null)::text','Suite 1','Deluxe suite'))::uuid;
  insert into t_res select 'kennel created', k1 is not null and (select kind from pet_kennels where id=k1)='Deluxe suite', null;
  k2 := pg_temp.as_run(da,'authenticated',format('select pet_save_kennel(null,%L,null,null)::text','Kennel A1'))::uuid;
  insert into t_res select 'kind defaults to Standard', (select kind from pet_kennels where id=k2)='Standard', null;
  kM := pg_temp.as_run(da,'authenticated',format('select pet_save_kennel(null,%L,%L,null)::text','Kennel B1','Standard'))::uuid;
  kB := pg_temp.as_run(db,'authenticated',format('select pet_save_kennel(null,%L,%L,null)::text','Suite 1','Standard'))::uuid;
  insert into t_res select 'same name allowed in another business', kB is not null, null;
  r := pg_temp.as_run(da,'authenticated',format('select pet_save_kennel(null,%L,%L,null)::text','  suite 1 ','Standard'));
  insert into t_res select 'duplicate kennel name (case/space-insensitive) blocked', r = 'ERR:KENNEL_NAME_TAKEN', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_save_kennel(null,%L,%L,null)::text','   ','Standard'));
  insert into t_res select 'blank kennel name blocked', r = 'ERR:KENNEL_NAME_REQUIRED', r;
  r := pg_temp.as_run(db,'authenticated',format('select pet_save_kennel(%L,%L,%L,null)::text',k1,'Hijack','Standard'));
  insert into t_res select 'other business cannot rename my kennel', r = 'ERR:KENNEL_NOT_FOUND', r;
  insert into t_res select 'other business cannot see my kennels', pg_temp.as_run(db,'authenticated','select count(*) from pet_kennels where name like ''Kennel%''')='0', null;
  r := pg_temp.as_run(da,'authenticated',format('insert into pet_kennels(salon_id,name) values (%L,%L)',pa,'Direct'));
  insert into t_res select 'client cannot insert kennels directly', r like 'ERR:%', r;
  r := pg_temp.as_run(da,'authenticated',format('update pet_kennels set name=%L where id=%L','X',k1));
  insert into t_res select 'client cannot update kennels directly', r like 'ERR:%', r;
  r := pg_temp.as_run(da,'authenticated',format('delete from pet_kennels where id=%L',k1));
  insert into t_res select 'client cannot delete kennels directly', r like 'ERR:%', r;
  r := pg_temp.as_run(null,'anon',format('select pet_save_kennel(null,%L,%L,null)::text','Anon','Standard'));
  insert into t_res select 'anon cannot call pet_save_kennel', r like 'ERR:%', r;
  r := pg_temp.as_run(null,'anon','select count(*) from pet_kennels');
  insert into t_res select 'anon cannot read kennels', r like 'ERR:%', r;

  -- maintenance blocks new stays
  perform pg_temp.as_run(da,'authenticated',format('select pet_set_kennel_maintenance(%L,true)::text',kM));
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA,petA,kM,d0,d0+2));
  insert into t_res select 'stay into a maintenance kennel blocked', r = 'ERR:KENNEL_MAINTENANCE', r;

  -- ---- stays: ownership and validation ----
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cB,petB,k1,d0,d0+2));
  insert into t_res select 'other business customer rejected', r = 'ERR:CUSTOMER_NOT_FOUND', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA,petA2,k1,d0,d0+2));
  insert into t_res select 'pet of a different customer rejected', r = 'ERR:PET_NOT_FOUND', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA,petA,kB,d0,d0+2));
  insert into t_res select 'other business kennel rejected', r = 'ERR:KENNEL_NOT_FOUND', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,%L,null,null,false)::text',cA,petA,k1,d0,d0+2,svcG));
  insert into t_res select 'grooming service rejected for a stay', r = 'ERR:SERVICE_NOT_FOUND', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,%L,null,null,false)::text',cA,petA,k1,d0,d0+2,svcOff));
  insert into t_res select 'inactive boarding service rejected', r = 'ERR:SERVICE_NOT_FOUND', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA,petA,k1,d0+2,d0));
  insert into t_res select 'check-out before check-in rejected', r = 'ERR:INVALID_DATES', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA,petA,k1,d0,d0+400));
  insert into t_res select 'stay longer than 365 days rejected', r = 'ERR:INVALID_DATES', r;

  -- ---- stays: create, snapshot, conflicts ----
  s1 := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',cA,petA,k1,d0,d0+3,svcB,'Two cups, 8am','Loves his duck'));
  insert into t_res select 'stay created as reserved with service snapshot', s1 !~ '^ERR' and exists(select 1 from pet_boarding_stays where id=s1::uuid and status='reserved' and service_name='Standard night' and nightly_rate=900 and feeding_notes='Two cups, 8am'), s1;
  update pet_services set price = 1500, name = 'Renamed' where id = svcB;
  insert into t_res select 'catalogue edits do not rewrite the stay', exists(select 1 from pet_boarding_stays where id=s1::uuid and nightly_rate=900 and service_name='Standard night'), null;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA2,petA2,k1,d0+1,d0+4));
  insert into t_res select 'overlapping stay in the same kennel blocked', r = 'ERR:STAY_CONFLICT_KENNEL', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA,petA,k2,d0+1,d0+2));
  insert into t_res select 'same pet in two kennels at once blocked', r = 'ERR:STAY_CONFLICT_PET', r;
  s2 := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA2,petA2,k1,d0+3,d0+5));
  insert into t_res select 'new stay may check in on the day another checks out', s2 !~ '^ERR', s2;
  s3 := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA,petA3,k2,d0+5,d0+5));
  insert into t_res select 'same-day (day care) stay accepted', s3 !~ '^ERR', s3;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA2,petA2,k2,d0+5,d0+5));
  insert into t_res select 'second same-day stay in that kennel blocked', r = 'ERR:STAY_CONFLICT_KENNEL', r;

  -- ---- status path ----
  r := pg_temp.as_run(da,'authenticated',format('select pet_set_stay_status(%L,%L)',s1,'checked-out'));
  insert into t_res select 'cannot check out a reserved stay', r = 'ERR:INVALID_STATUS_CHANGE', r;
  r := pg_temp.as_run(db,'authenticated',format('select pet_set_stay_status(%L,%L)',s1,'occupied'));
  insert into t_res select 'other business cannot change my stay', r = 'ERR:STAY_NOT_FOUND', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_set_stay_status(%L,%L)',s1,'occupied'));
  insert into t_res select 'check in works and stamps the time', r='occupied' and (select checked_in_at is not null from pet_boarding_stays where id=s1::uuid), r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_set_stay_status(%L,%L)',s1,'cancelled'));
  insert into t_res select 'cannot cancel an occupied stay', r = 'ERR:INVALID_STATUS_CHANGE', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_set_kennel_maintenance(%L,true)::text',k1));
  insert into t_res select 'cannot put an occupied kennel into maintenance', r = 'ERR:KENNEL_OCCUPIED', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_update_stay(%L,%L,%L,%L,null,null)',s1,k1,d0-1,d0+3));
  insert into t_res select 'occupied stay check-in date is locked', r = 'ERR:STAY_CHECKIN_LOCKED', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_update_stay(%L,%L,%L,%L,%L,%L)',s1,k1,d0,d0+2,'New feed','New note'));
  insert into t_res select 'occupied stay can shorten check-out and edit notes', r in ('OK','') or r !~ '^ERR', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_update_stay(%L,%L,%L,%L,null,null)',s1,k1,d0,d0+9));
  insert into t_res select 'extending into the next reserved stay is blocked', r = 'ERR:STAY_CONFLICT_KENNEL', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_set_stay_status(%L,%L)',s1,'checked-out'));
  insert into t_res select 'check out works and stamps the time', r='checked-out' and (select checked_out_at is not null from pet_boarding_stays where id=s1::uuid), r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA2,petA2,k1,d0+1,d0+3));
  insert into t_res select 'checking out early frees the kennel immediately', r !~ '^ERR', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_update_stay(%L,%L,%L,%L,null,null)',s1,k1,d0,d0+1));
  insert into t_res select 'checked-out stay cannot be edited', r = 'ERR:STAY_NOT_EDITABLE', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_set_stay_status(%L,%L)',s1,'occupied'));
  insert into t_res select 'checked-out is final', r = 'ERR:INVALID_STATUS_CHANGE', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_set_stay_status(%L,%L)',s2,'cancelled'));
  insert into t_res select 'a reserved stay can be cancelled', r='cancelled', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_create_stay(%L,%L,%L,%L,%L,null,null,null,false)::text',cA2,petA2,k1,d0+3,d0+4));
  insert into t_res select 'cancelling frees the kennel', r !~ '^ERR', r;

  -- ---- client writes, kennel delete, history protection ----
  r := pg_temp.as_run(da,'authenticated',format('update pet_boarding_stays set status=%L where id=%L','checked-out',s3));
  insert into t_res select 'client cannot write stays directly', r like 'ERR:%', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_delete_kennel(%L)',k2));
  insert into t_res select 'kennel with stay history cannot be deleted', r = 'ERR:KENNEL_HAS_STAYS', r;
  r := pg_temp.as_run(da,'authenticated',format('select pet_delete_kennel(%L)',kM));
  insert into t_res select 'empty kennel can be deleted', r !~ '^ERR' and not exists(select 1 from pet_kennels where id=kM), r;
  begin delete from pet_pets where id=petA; r := 'deleted'; exception when others then r := 'ERR:' || sqlerrm; end;
  insert into t_res select 'pet with stays cannot be deleted', r like 'ERR:%', r;
  begin delete from customers where id=cA; r := 'deleted'; exception when others then r := 'ERR:' || sqlerrm; end;
  insert into t_res select 'customer with stays cannot be deleted', r like 'ERR:%', r;

  -- ---- audit ----
  insert into t_res select 'stay and kennel changes are audited under the right business',
    (select count(*) from pet_audit_log where salon_id=pa and table_name='pet_boarding_stays')>=6
    and (select count(*) from pet_audit_log where salon_id=pa and table_name='pet_kennels')>=3
    and (select count(*) from pet_audit_log where salon_id=pb and table_name='pet_boarding_stays')=0, null;
  insert into t_res select 'audit records column names only for stay updates',
    exists(select 1 from pet_audit_log where table_name='pet_boarding_stays' and op='UPDATE' and 'status' = any(changed_columns)), null;

  select count(*) filter (where ok is not true) into fails from t_res;
  raise exception 'RESULTS: FAILED=% TOTAL=% FAILED_TESTS=%', fails, (select count(*) from t_res), (select coalesce(jsonb_agg(name||' => '||coalesce(got,'')) filter (where ok is not true),'[]'::jsonb) from t_res);
end $$;
