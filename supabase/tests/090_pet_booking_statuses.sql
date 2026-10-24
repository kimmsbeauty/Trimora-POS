-- supabase/tests/090_pet_booking_statuses.sql
-- Run on a scratch/staging database ONLY, with migrations 083-088 and 090 applied.
-- Self-cleaning: raises its results so the transaction rolls back. Expected FAILED=0.
-- A NULL outcome counts as a failure (ok is not true).

create or replace function pg_temp.as_run(p_uid uuid, p_role text, p_sql text) returns text
language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{"role":"anon"}' else jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', '{}', true);
  execute format('set local role %I', p_role);
  begin execute p_sql into v; exception when others then v := 'ERR:' || sqlerrm; end;
  execute 'reset role';
  return v;
end $f$;

do $$
declare
  sa uuid := gen_random_uuid(); u uuid := gen_random_uuid();
  c uuid; stf uuid; stf2 uuid; svc uuid;
  p1 uuid; p2 uuid; p3 uuid;
  t0 timestamptz := date_trunc('day', now()) + interval '5 days' + interval '9 hours';
  b uuid; b2 uuid; r text; fails int;
  statuses text[] := array['booked','checked-in','in-progress','ready','completed','cancelled','no-show'];
  allowed text[] := array['booked>checked-in','booked>cancelled','booked>no-show','checked-in>in-progress','checked-in>cancelled','in-progress>ready','ready>completed'];
  frm text; tto text; i int; j int; k int;
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;
  insert into salons(id,name,slug,business_type) values (sa,'P','p','pet');
  insert into auth.users(id,instance_id,aud,role,email) values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','u@t.invalid');
  insert into salon_auth_users(id,salon_id) values (u,sa);
  insert into customers(name,salon_id) values ('C',sa) returning id into c;
  insert into staff(name,role,salon_id) values ('G1','Groomer',sa) returning id into stf;
  insert into staff(name,role,salon_id) values ('G2','Groomer',sa) returning id into stf2;
  insert into pet_services(salon_id,name,category,duration_minutes,price) values (sa,'Bath','Grooming',60,1500) returning id into svc;
  insert into pet_pets(salon_id,customer_id,name,species) values (sa,c,'P1','Dog') returning id into p1;
  insert into pet_pets(salon_id,customer_id,name,species) values (sa,c,'P2','Dog') returning id into p2;
  insert into pet_pets(salon_id,customer_id,name,species) values (sa,c,'P3','Cat') returning id into p3;

  -- schema shape
  insert into t_res select 'status check allows exactly the seven statuses',
    (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.pet_bookings'::regclass and conname='pet_bookings_status_check')
      ~ $q$booked.*checked-in.*in-progress.*ready.*completed.*cancelled.*no-show$q$
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.pet_bookings'::regclass and conname='pet_bookings_status_check') !~ 'pending|confirmed', null;
  insert into t_res select 'default status is booked', (select column_default from information_schema.columns where table_name='pet_bookings' and column_name='status') = '''booked''::text', null;
  insert into t_res select 'old statuses are rejected by the table', (select count(*) from unnest(array['pending','confirmed','nonsense']) s
    where pg_temp.as_run(null, 'postgres', format($f$insert into pet_bookings(salon_id,customer_id,pet_id,starts_at,ends_at,status) values (%L,%L,%L,%L,%L,%L) returning id::text$f$, sa,c,p3,t0,t0+interval '1 hour',s)) like 'ERR:%check%') = 3, null;

  -- creation
  r := pg_temp.as_run(u,'authenticated',format('select public.pet_create_booking(%L,%L,%L,%L,%L,%L::uuid[])::text', c,p1,stf,t0,t0+interval '1 hour',array[svc]));
  b := r::uuid;
  insert into t_res select 'new booking starts as booked', (select status from pet_bookings where id=b)='booked', r;
  r := pg_temp.as_run(u,'authenticated',format('select public.pet_create_booking(%L,%L,%L,%L,%L,%L::uuid[],true)::text', c,p3,stf2,t0,t0+interval '1 hour',array[svc]));
  insert into t_res select 'walk-in starts as checked-in', (select status from pet_bookings where id=r::uuid)='checked-in', r;

  -- the full status matrix: every (from, to) pair is either allowed or refused, never an unrelated error
  for i in 1..7 loop for j in 1..7 loop
    frm := statuses[i]; tto := statuses[j];
    -- fresh booking forced into the 'from' status (bypassing the functions) at a distinct slot per pair, other pet/staff combos
    insert into pet_bookings(salon_id,customer_id,pet_id,staff_id,starts_at,ends_at,status)
      values (sa,c,p2,null, t0 + ((i*10+j) || ' days')::interval, t0 + ((i*10+j) || ' days')::interval + interval '1 hour', frm) returning id into b2;
    r := pg_temp.as_run(u,'authenticated',format('select public.pet_set_booking_status(%L,%L)', b2, tto));
    if frm = tto then
      insert into t_res select format('%s -> %s (same status) is refused', frm, tto), r = 'ERR:INVALID_STATUS_CHANGE', r;
    elsif (frm||'>'||tto) = any(allowed) then
      insert into t_res select format('%s -> %s is allowed', frm, tto), r = tto and (select status from pet_bookings where id=b2)=tto, r;
    else
      insert into t_res select format('%s -> %s is refused', frm, tto), r = 'ERR:INVALID_STATUS_CHANGE' and (select status from pet_bookings where id=b2)=frm, r;
    end if;
  end loop; end loop;
  insert into t_res select 'NULL status gives the normal error', pg_temp.as_run(u,'authenticated',format('select public.pet_set_booking_status(%L,NULL)', b)) = 'ERR:INVALID_STATUS_CHANGE', null;
  insert into t_res select 'old status word is refused', pg_temp.as_run(u,'authenticated',format('select public.pet_set_booking_status(%L,%L)', b,'confirmed')) = 'ERR:INVALID_STATUS_CHANGE', null;

  -- walk the prototype workflow on one booking
  foreach tto in array array['checked-in','in-progress','ready','completed'] loop
    r := pg_temp.as_run(u,'authenticated',format('select public.pet_set_booking_status(%L,%L)', b, tto));
  end loop;
  insert into t_res select 'booked -> checked-in -> in-progress -> ready -> completed works end to end', (select status from pet_bookings where id=b)='completed', r;

  -- reschedule rule: only booked and checked-in
  for k in 1..7 loop
    insert into pet_bookings(salon_id,customer_id,pet_id,starts_at,ends_at,status)
      values (sa,c,p2, t0 + ((300+k) || ' days')::interval, t0 + ((300+k) || ' days')::interval + interval '1 hour', statuses[k]) returning id into b2;
    r := pg_temp.as_run(u,'authenticated',format('select public.pet_update_booking(%L,NULL,%L,%L,%L)::text', b2, t0+((400+k)||' days')::interval, t0+((400+k)||' days')::interval+interval '1 hour', 'x'));
    insert into t_res select format('reschedule when %s: %s', statuses[k], case when statuses[k] in ('booked','checked-in') then 'allowed' else 'refused' end),
      case when statuses[k] in ('booked','checked-in') then r is null or r = '' else r = 'ERR:BOOKING_NOT_EDITABLE' end, r;
  end loop;

  -- conflict rules by status (staff stf, pet p1; one booking at t0..t0+1h each time)
  for k in 1..7 loop
    delete from pet_bookings where salon_id = sa and starts_at >= t0 + interval '1000 days';
    insert into pet_bookings(salon_id,customer_id,pet_id,staff_id,starts_at,ends_at,status)
      values (sa,c,p1,stf, t0 + interval '1000 days', t0 + interval '1000 days' + interval '1 hour', statuses[k]);
    r := pg_temp.as_run(u,'authenticated',format('select public.pet_create_booking(%L,%L,%L,%L,%L,%L::uuid[])::text', c,p2,stf, t0 + interval '1000 days' + interval '30 minutes', t0 + interval '1000 days' + interval '90 minutes', array[svc]));
    insert into t_res select format('another booking for the same staff overlapping a %s one: %s', statuses[k], case when statuses[k] in ('cancelled','no-show') then 'allowed (slot freed)' else 'refused' end),
      case when statuses[k] in ('cancelled','no-show') then r like '%-%-%-%-%' else r = 'ERR:BOOKING_CONFLICT_STAFF' end, r;
    delete from pet_bookings where salon_id = sa and starts_at >= t0 + interval '1000 days';
    insert into pet_bookings(salon_id,customer_id,pet_id,staff_id,starts_at,ends_at,status)
      values (sa,c,p1,stf, t0 + interval '1000 days', t0 + interval '1000 days' + interval '1 hour', statuses[k]);
    r := pg_temp.as_run(u,'authenticated',format('select public.pet_create_booking(%L,%L,%L,%L,%L,%L::uuid[])::text', c,p1,stf2, t0 + interval '1000 days' + interval '30 minutes', t0 + interval '1000 days' + interval '90 minutes', array[svc]));
    insert into t_res select format('same pet overlapping a %s booking: %s', statuses[k], case when statuses[k] in ('cancelled','no-show') then 'allowed' else 'refused' end),
      case when statuses[k] in ('cancelled','no-show') then r like '%-%-%-%-%' else r = 'ERR:BOOKING_CONFLICT_PET' end, r;
  end loop;
  delete from pet_bookings where salon_id = sa and starts_at >= t0 + interval '1000 days';

  -- security unchanged
  insert into t_res select 'anon still cannot run the status function', not has_function_privilege('anon','public.pet_set_booking_status(uuid,text)','execute')
    and not has_function_privilege('anon','public.pet_create_booking(uuid,uuid,uuid,timestamptz,timestamptz,uuid[],boolean,text)','execute')
    and not has_function_privilege('anon','public.pet_update_booking(uuid,uuid,timestamptz,timestamptz,text)','execute'), null;
  insert into t_res select 'signed-in devices still can', has_function_privilege('authenticated','public.pet_set_booking_status(uuid,text)','execute')
    and has_function_privilege('authenticated','public.pet_create_booking(uuid,uuid,uuid,timestamptz,timestamptz,uuid[],boolean,text)','execute')
    and has_function_privilege('authenticated','public.pet_update_booking(uuid,uuid,timestamptz,timestamptz,text)','execute'), null;
  insert into t_res select 'functions keep a fixed search_path and run as definer',
    (select count(*) from pg_proc where proname in ('pet_create_booking','pet_update_booking','pet_set_booking_status') and prosecdef and proconfig::text like '%search_path=public, extensions, pg_temp%')=3, null;
  insert into t_res select 'signed-in devices still cannot write the table directly',
    pg_temp.as_run(u,'authenticated',format('update pet_bookings set status=%L where id=%L','completed',b)) like 'ERR:%permission denied%', null;

  select count(*) filter (where ok is not true) into fails from t_res;
  raise exception 'RESULTS: FAILED=% TOTAL=% FAILED_TESTS=%', fails, (select count(*) from t_res), (select coalesce(jsonb_agg(name||' => '||coalesce(got,'')) filter (where ok is not true),'[]'::jsonb) from t_res);
end $$;
