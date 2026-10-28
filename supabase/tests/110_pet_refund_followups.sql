-- supabase/tests/110_pet_refund_followups.sql
-- NOT FOR PRODUCTION. Needs 090, 095, 101, 105, 089 + 104 + 107 and 110 applied on a database with
-- production's PIN functions. Self-cleaning: the final RAISE rolls back. Expected: FAILED=0.

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
  s1 uuid := gen_random_uuid(); d1 uuid := gen_random_uuid(); c1 uuid := gen_random_uuid();
  svc uuid := gen_random_uuid(); pet uuid := gen_random_uuid(); bk uuid := gen_random_uuid();
  ken uuid := gen_random_uuid(); stay uuid := gen_random_uuid(); stay2 uuid := gen_random_uuid();
  cl jsonb; n text; invA uuid; invB uuid; sinv uuid; sinv2 uuid; fails int;
  acct record;
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;

  insert into salons(id,name,slug,business_type) values (s1,'S1','s1','pet');
  insert into auth.users(id) values (d1);
  insert into salon_auth_users(id,salon_id) values (d1,s1);
  insert into salon_pins(role,pin_hash,hash_version,salon_id) values
    ('staff',crypt('1111',gen_salt('bf',10)),'bcrypt',s1),('admin',crypt('9999',gen_salt('bf',10)),'bcrypt',s1);
  insert into salon_settings(salon_id) values (s1);
  insert into customers(id,salon_id,name) values (c1,s1,'Cust');
  insert into pet_pets(id,salon_id,name,customer_id) values (pet,s1,'Rex',c1);
  insert into pet_services(id,salon_id,name,price) values (svc,s1,'Bath',2000);
  insert into pet_loyalty_settings(salon_id,enabled,kes_per_point) values (s1,true,100);
  insert into pet_bookings(id,salon_id,customer_id,pet_id,status) values (bk,s1,c1,pet,'completed');
  cl := jsonb_build_object('sub',d1,'role','authenticated');

  create or replace function pg_temp.u(t text) returns uuid language sql as $f$ select case when t ~ '^[0-9a-f-]{36}$' then t::uuid end $f$;
  create or replace function pg_temp.cl_g() returns jsonb language sql as $f$ select jsonb_build_object('sub',(select id from auth.users limit 1),'role','authenticated') $f$;
  create or replace function pg_temp.mk(p_booking uuid, p_pay integer) returns uuid language plpgsql as $f$
  begin
    return pg_temp.as_claims(pg_temp.cl_g(), 'authenticated', format('select pet_create_invoice(%L,%L,null,%L,%L::jsonb,''amount'',0,null,null,%L::jsonb)::text',
      gen_random_uuid(), (select id from customers limit 1), p_booking, jsonb_build_array(jsonb_build_object('service_id',(select id from pet_services limit 1),'quantity',1)),
      case when p_pay > 0 then jsonb_build_array(jsonb_build_object('method','cash','amount',p_pay)) else '[]'::jsonb end))::uuid;
  end $f$;
  create or replace function pg_temp.rf(p_pin text, p_inv uuid, p_amt integer) returns text language plpgsql as $f$
  begin
    return pg_temp.as_claims(pg_temp.cl_g(),'authenticated', format('select pet_refund_invoice(%L,%L,%L,''cash'',%L,''test'',null,false)::text', p_pin, gen_random_uuid(), p_inv, p_amt));
  end $f$;

  -- ---------------- booking: paid invoice holds the booking
  invA := pg_temp.mk(bk, 2000);
  insert into t_res select 'setup: booking invoice A is paid (2000), 20 points, lifetime 20', (select status from pet_invoices where id=invA)='paid'
    and (select points_balance from pet_loyalty_accounts where customer_id=c1)=20 and (select lifetime_earned from pet_loyalty_accounts where customer_id=c1)=20, null;
  n := pg_temp.as_claims(cl,'authenticated', format('select pet_create_invoice(%L,%L,null,%L,%L::jsonb,''amount'',0,null,null,''[]''::jsonb)::text', gen_random_uuid(), c1, bk, jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',1))));
  insert into t_res select 'a paid invoice still holds its booking', n like 'ERR:BOOKING_ALREADY_INVOICED%', n;

  -- partial refund: still holds
  n := pg_temp.rf('9999', invA, 500);
  insert into t_res select 'partial refund recorded', n ~ '^[0-9a-f-]{36}$' and (select status from pet_invoices where id=invA)='paid', n;
  n := pg_temp.as_claims(cl,'authenticated', format('select pet_create_invoice(%L,%L,null,%L,%L::jsonb,''amount'',0,null,null,''[]''::jsonb)::text', gen_random_uuid(), c1, bk, jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',1))));
  insert into t_res select 'a PARTLY refunded invoice still holds the booking (no double charge)', n like 'ERR:BOOKING_ALREADY_INVOICED%', n;

  -- full refund: frees it
  n := pg_temp.rf('9999', invA, 1500);
  insert into t_res select 'full refund closes invoice A as refunded', (select status from pet_invoices where id=invA)='refunded', n;
  insert into t_res select 'loyalty: balance AND lifetime_earned both drop to 0 after the refund', (select points_balance from pet_loyalty_accounts where customer_id=c1)=0
    and (select lifetime_earned from pet_loyalty_accounts where customer_id=c1)=0, (select points_balance||'/'||lifetime_earned from pet_loyalty_accounts where customer_id=c1);
  invB := pg_temp.u(pg_temp.as_claims(cl,'authenticated', format('select pet_create_invoice(%L,%L,null,%L,%L::jsonb,''amount'',0,null,null,''[]''::jsonb)::text', gen_random_uuid(), c1, bk, jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',1)))));
  insert into t_res select 'after a FULL refund the booking can be billed again', invB is not null and exists (select 1 from pet_invoices where id=invB and booking_id=bk and status='issued'), null;
  n := pg_temp.as_claims(cl,'authenticated', format('select pet_create_invoice(%L,%L,null,%L,%L::jsonb,''amount'',0,null,null,''[]''::jsonb)::text', gen_random_uuid(), c1, bk, jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',1))));
  insert into t_res select 'but only ONE live invoice per booking at a time', n like 'ERR:BOOKING_ALREADY_INVOICED%', n;
  insert into t_res select 'the refunded invoice and the new one both exist (history kept)', (select count(*) from pet_invoices where booking_id=bk)=2, null;

  -- ---------------- boarding stay
  insert into pet_kennels(id,salon_id,name) values (ken,s1,'K1');
  insert into pet_boarding_stays(id,salon_id,customer_id,pet_id,kennel_id,check_in_on,check_out_on,status,service_id,service_name,nightly_rate,checked_out_at)
    values (stay,s1,c1,pet,ken,current_date-3,current_date-1,'checked-out',svc,'Boarding',1000,now()-interval '1 day');
  sinv := pg_temp.as_claims(cl,'authenticated', format('select pet_invoice_stay(%L,%L,null,''amount'',0,null,null)::text', gen_random_uuid(), stay))::uuid;
  insert into t_res select 'setup: stay invoiced (2 nights x 1000)', (select total from pet_invoices where id=sinv)=2000, null;
  n := pg_temp.as_claims(cl,'authenticated', format('select pet_invoice_stay(%L,%L,null,''amount'',0,null,null)::text', gen_random_uuid(), stay));
  insert into t_res select 'a live stay invoice blocks a second one', n like 'ERR:STAY_ALREADY_INVOICED%', n;
  n := pg_temp.as_claims(cl,'authenticated', format('select invoice_number from pet_stay_billing(%L)', stay));
  insert into t_res select 'pet_stay_billing shows the live invoice', n is not null and n not like 'ERR:%', n;
  -- pay it, partly refund, still blocked
  perform pg_temp.as_claims(cl,'authenticated', format('select pet_record_payment(%L,''cash'',2000,null)::text', sinv));
  perform pg_temp.rf('9999', sinv, 300);
  n := pg_temp.as_claims(cl,'authenticated', format('select pet_invoice_stay(%L,%L,null,''amount'',0,null,null)::text', gen_random_uuid(), stay));
  insert into t_res select 'a PARTLY refunded stay invoice still blocks re-billing', n like 'ERR:STAY_ALREADY_INVOICED%', n;
  perform pg_temp.rf('9999', sinv, 1700);
  insert into t_res select 'stay invoice fully refunded', (select status from pet_invoices where id=sinv)='refunded', null;
  n := pg_temp.as_claims(cl,'authenticated', format('select invoice_number from pet_stay_billing(%L)', stay));
  insert into t_res select 'pet_stay_billing no longer shows the refunded invoice as the live one', n is null, coalesce(n,'null');
  sinv2 := pg_temp.u(pg_temp.as_claims(cl,'authenticated', format('select pet_invoice_stay(%L,%L,null,''amount'',0,null,null)::text', gen_random_uuid(), stay)));
  insert into t_res select 'after a FULL refund the stay can be billed again', sinv2 is not null and sinv2 <> sinv and (select status from pet_invoices where id=sinv2)='issued', null;
  n := pg_temp.as_claims(cl,'authenticated', format('select pet_invoice_stay(%L,%L,null,''amount'',0,null,null)::text', gen_random_uuid(), stay));
  insert into t_res select 'but only ONE live invoice per stay at a time', n like 'ERR:STAY_ALREADY_INVOICED%', n;

  -- ---------------- void still frees (unchanged behaviour)
  perform pg_temp.as_claims(cl,'authenticated', format('select pet_void_invoice(%L,%L)::text', sinv2, 'wrong'));
  n := pg_temp.as_claims(cl,'authenticated', format('select pet_invoice_stay(%L,%L,null,''amount'',0,null,null)::text', gen_random_uuid(), stay));
  insert into t_res select 'a void invoice still frees the stay (unchanged)', n ~ '^[0-9a-f-]{36}$', n;

  -- ---------------- loyalty reversal never makes lifetime negative, and earning/other reasons unaffected
  perform pet_loyalty_apply(s1, c1, 50, 'visit_bonus', 'bonus', null, null);
  insert into t_res select 'other reasons still behave: visit bonus adds to balance and lifetime', (select points_balance from pet_loyalty_accounts where customer_id=c1)>=50
    and (select lifetime_earned from pet_loyalty_accounts where customer_id=c1)>=50, null;
  perform pet_loyalty_apply(s1, c1, -10, 'redeem', 'spend', null, null);
  insert into t_res select 'redeeming lowers the balance but NOT lifetime (unchanged)', (select lifetime_earned from pet_loyalty_accounts where customer_id=c1) = (select points_balance from pet_loyalty_accounts where customer_id=c1) + 10, null;

  select count(*) into fails from t_res where ok is not true;
  for n in select format('%s  %s%s', case when ok is true then 'PASS' else 'FAIL' end, name, case when ok is true then '' else '  [got: '||coalesce(got,'null')||']' end) from t_res loop
    raise notice '%', n;
  end loop;
  raise exception 'FAILED=% of % (rolled back)', fails, (select count(*) from t_res);
end $$;
