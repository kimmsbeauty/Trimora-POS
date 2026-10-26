-- supabase/tests/105_pet_refunds.sql
-- NOT FOR PRODUCTION. Needs 105 applied on a database that has 090, 094, 095 and 101 and production's
-- PIN functions (verify_staff_pin, check_pin_lockout, auth_salon_id). Self-cleaning: the final RAISE
-- rolls everything back. Expected: FAILED=0. A NULL outcome counts as a failure (ok is not true).

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
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  svc uuid := gen_random_uuid(); itm uuid := gen_random_uuid();
  cl1 jsonb; cl2 jsonb;
  invA uuid; invB uuid; invC uuid; invX uuid; invOther uuid;
  n text; r1 text; r2 text; k uuid; fails int; i int;
  function_ok boolean;
begin
  create temp table if not exists t_res(name text, ok boolean, got text) on commit drop;
  grant all on t_res to public;

  insert into salons(id,name,slug,business_type) values (s1,'S1','s1','pet'),(s2,'S2','s2','pet');
  insert into auth.users(id) values (d1),(d2);
  insert into salon_auth_users(id,salon_id) values (d1,s1),(d2,s2);
  insert into salon_pins(role,pin_hash,hash_version,salon_id) values
    ('staff',crypt('1111',gen_salt('bf',10)),'bcrypt',s1),('admin',crypt('9999',gen_salt('bf',10)),'bcrypt',s1),
    ('staff',crypt('2222',gen_salt('bf',10)),'bcrypt',s2),('admin',crypt('8888',gen_salt('bf',10)),'bcrypt',s2);
  insert into salon_settings(salon_id) values (s1),(s2);
  insert into customers(id,salon_id,name) values (c1,s1,'Cust 1'),(c2,s2,'Cust 2');
  insert into pet_services(id,salon_id,name,price) values (svc,s1,'Bath',1000);
  insert into pet_items(id,salon_id,kind,name,price,quantity_on_hand) values (itm,s1,'retail','Shampoo',500,10);
  insert into pet_loyalty_settings(salon_id,enabled,kes_per_point) values (s1,true,100);
  cl1 := jsonb_build_object('sub',d1,'role','authenticated');
  cl2 := jsonb_build_object('sub',d2,'role','authenticated');

  -- invoice A: service 1000 + 2 x product 500 = 2000, paid in full in cash (20 points, stock 10 -> 8)
  invA := pg_temp.as_claims(cl1,'authenticated', format('select pet_create_invoice(%L,%L,null,null,%L::jsonb,''amount'',0,null,null,%L::jsonb)::text',
    gen_random_uuid(), c1, jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',1), jsonb_build_object('item_id',itm,'quantity',2)),
    jsonb_build_array(jsonb_build_object('method','cash','amount',2000))))::uuid;
  insert into t_res select 'setup: invoice A is paid, 2000, stock 8, 20 points',
    (select status from pet_invoices where id=invA)='paid' and (select amount_paid from pet_invoices where id=invA)=2000
    and (select quantity_on_hand from pet_items where id=itm)=8
    and (select points_balance from pet_loyalty_accounts where customer_id=c1)=20, null;

  -- helper to call the function
  create or replace function pg_temp.rf(p_cl jsonb, p_pin text, p_key uuid, p_inv uuid, p_method text, p_amt integer, p_reason text, p_ref text, p_restock boolean) returns text
  language plpgsql as $f$
  begin
    return pg_temp.as_claims(p_cl,'authenticated', format('select pet_refund_invoice(%L,%L,%L,%L,%L,%L,%L,%L)::text', p_pin,p_key,p_inv,p_method,p_amt,p_reason,p_ref,p_restock));
  end $f$;

  -- ---- grants and sessions
  n := pg_temp.as_claims('{"role":"anon"}','anon', format('select pet_refund_invoice(%L,%L,%L,%L,1,%L,null,false)::text','9999',gen_random_uuid(),invA,'cash','x'));
  insert into t_res select 'anon cannot call pet_refund_invoice', n like 'ERR:%permission denied%', n;
  n := pg_temp.rf(('{"role":"authenticated","sub":"'||gen_random_uuid()||'"}')::jsonb,'9999',gen_random_uuid(),invA,'cash',100,'x',null,false);
  insert into t_res select 'a session with no business is refused', n like 'ERR:NOT_AUTHENTICATED%', n;

  -- ---- the proof: no PIN / staff PIN / wrong PIN refund nothing
  n := pg_temp.rf(cl1,null,gen_random_uuid(),invA,'cash',500,'Customer returned goods',null,false);
  insert into t_res select 'ATTACK: no PIN -> null and nothing changes', n is null and not exists (select 1 from pet_refunds), coalesce(n,'null');
  n := pg_temp.rf(cl1,'1111',gen_random_uuid(),invA,'cash',500,'Customer returned goods',null,false);
  insert into t_res select 'ATTACK: STAFF PIN is not the admin proof -> null, nothing changes', n is null and not exists (select 1 from pet_refunds)
    and (select amount_refunded from pet_invoices where id=invA)=0, coalesce(n,'null');
  n := pg_temp.rf(cl1,'0000',gen_random_uuid(),invA,'cash',500,'Customer returned goods',null,false);
  insert into t_res select 'wrong PIN -> null, nothing changes (invoice, stock, points)', n is null and not exists (select 1 from pet_refunds)
    and (select quantity_on_hand from pet_items where id=itm)=8 and (select points_balance from pet_loyalty_accounts where customer_id=c1)=20, coalesce(n,'null');
  insert into t_res select 'another business''s admin PIN is not a proof here', pg_temp.rf(cl1,'8888',gen_random_uuid(),invA,'cash',500,'x',null,false) is null, null;
  delete from pin_login_attempts where salon_id = s1;

  -- ---- validation: raises before any PIN attempt is counted
  n := pg_temp.rf(cl1,'0000',null,invA,'cash',500,'x',null,false);
  insert into t_res select 'null key rejected', n like 'ERR:INVALID_KEY%', n;
  n := pg_temp.rf(cl1,'0000',gen_random_uuid(),invA,'cash',500,'   ',null,false);
  insert into t_res select 'blank reason rejected', n like 'ERR:REASON_REQUIRED%', n;
  n := pg_temp.rf(cl1,'0000',gen_random_uuid(),invA,'bitcoin',500,'x',null,false);
  insert into t_res select 'unknown method rejected', n like 'ERR:INVALID_REFUND%', n;
  n := pg_temp.rf(cl1,'0000',gen_random_uuid(),invA,'cash',0,'x',null,false);
  insert into t_res select 'zero amount rejected', n like 'ERR:INVALID_REFUND%', n;
  n := pg_temp.rf(cl1,'0000',gen_random_uuid(),invA,'cash',-5,'x',null,false);
  insert into t_res select 'negative amount rejected', n like 'ERR:INVALID_REFUND%', n;
  n := pg_temp.rf(cl1,'0000',gen_random_uuid(),invA,'cash',2001,'x',null,false);
  insert into t_res select 'cannot refund more than was paid', n like 'ERR:REFUND_EXCEEDS_PAID%', n;
  n := pg_temp.rf(cl1,'0000',gen_random_uuid(),gen_random_uuid(),'cash',100,'x',null,false);
  insert into t_res select 'unknown invoice', n like 'ERR:INVOICE_NOT_FOUND%', n;
  n := pg_temp.rf(cl1,'0000',gen_random_uuid(),invA,'cash',500,'x',null,true);
  insert into t_res select 'return_stock on a partial refund is rejected', n like 'ERR:RETURN_STOCK_NEEDS_FULL_REFUND%', n;
  insert into t_res select 'none of those burned a PIN attempt', not exists (select 1 from pin_login_attempts where salon_id=s1), (select count(*)::text from pin_login_attempts where salon_id=s1);

  -- other business's invoice
  insert into pet_invoices(salon_id,customer_id,invoice_number,idempotency_key,status,subtotal,total,amount_paid) values (s2,c2,'INV-9001',gen_random_uuid(),'paid',500,500,500) returning id into invOther;
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invOther,'cash',100,'x',null,false);
  insert into t_res select 'cannot refund another business''s invoice', n like 'ERR:INVOICE_NOT_FOUND%', n;

  -- unpaid and void invoices
  invX := pg_temp.as_claims(cl1,'authenticated', format('select pet_create_invoice(%L,%L,null,null,%L::jsonb,''amount'',0,null,null,''[]''::jsonb)::text',
    gen_random_uuid(), c1, jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',1))))::uuid;
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invX,'cash',100,'x',null,false);
  insert into t_res select 'an unpaid invoice cannot be refunded (void it instead)', n like 'ERR:INVOICE_NOT_REFUNDABLE%', n;
  perform pg_temp.as_claims(cl1,'authenticated', format('select pet_void_invoice(%L,%L)::text', invX, 'test'));
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invX,'cash',100,'x',null,false);
  insert into t_res select 'a void invoice cannot be refunded', n like 'ERR:INVOICE_NOT_REFUNDABLE%', n;
  delete from pin_login_attempts where salon_id = s1;

  -- ---- partial refund of a paid invoice (500 of 2000)
  k := gen_random_uuid();
  r1 := pg_temp.rf(cl1,'9999',k,invA,'cash',500,'Customer returned one shampoo',null,false);
  insert into t_res select 'admin PIN: partial refund recorded; invoice stays paid', r1 ~ '^[0-9a-f-]{36}$'
    and (select amount_refunded from pet_invoices where id=invA)=500 and (select status from pet_invoices where id=invA)='paid'
    and (select count(*) from pet_refunds where invoice_id=invA)=1, coalesce(r1,'null');
  insert into t_res select 'partial refund does not touch stock', (select quantity_on_hand from pet_items where id=itm)=8, null;
  insert into t_res select 'partial refund takes back 5 of 20 points (proportional)', (select points_balance from pet_loyalty_accounts where customer_id=c1)=15
    and (select coalesce(sum(points),0) from pet_loyalty_ledger where reason='refund_reversal' and reference_id=invA)=-5, (select points_balance::text from pet_loyalty_accounts where customer_id=c1);
  -- idempotent replay
  r2 := pg_temp.rf(cl1,'9999',k,invA,'cash',500,'Customer returned one shampoo',null,false);
  insert into t_res select 'same key replays the same refund: no second payout', r2 = r1 and (select count(*) from pet_refunds where invoice_id=invA)=1
    and (select amount_refunded from pet_invoices where id=invA)=500, coalesce(r2,'null');
  n := pg_temp.rf(cl1,'9999',k,invA,'cash',400,'different amount',null,false);
  insert into t_res select 'same key with a different amount is a conflict', n like 'ERR:IDEMPOTENCY_CONFLICT%', n;
  -- replay needs no PIN (it creates nothing)
  n := pg_temp.rf(cl1,'0000',k,invA,'cash',500,'Customer returned one shampoo',null,false);
  insert into t_res select 'replay of a finished refund creates nothing even with a wrong PIN', n = r1 and (select count(*) from pet_refunds where invoice_id=invA)=1, coalesce(n,'null');

  -- reference uniqueness
  r2 := pg_temp.rf(cl1,'9999',gen_random_uuid(),invA,'mpesa',300,'Goodwill','QWE123RT',false);
  insert into t_res select 'a refund with a reference is recorded', r2 ~ '^[0-9a-f-]{36}$' and (select amount_refunded from pet_invoices where id=invA)=800, coalesce(r2,'null');
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invA,'mpesa',100,'Again',' qwe123rt ',false);
  insert into t_res select 'the same reference cannot be used twice for a method (case-insensitive)', n like 'ERR:DUPLICATE_REFUND_REFERENCE%' and (select amount_refunded from pet_invoices where id=invA)=800, n;
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invA,'cash',100,'Other method same ref','QWE123RT',false);
  insert into t_res select 'the same reference on another method is allowed', n ~ '^[0-9a-f-]{36}$', n;
  -- invoice A now: refunded 900, refundable 1100
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invA,'cash',1101,'x',null,false);
  insert into t_res select 'cannot refund more than what is left', n like 'ERR:REFUND_EXCEEDS_PAID%', n;

  -- ---- final refund with stock return
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invA,'cash',1100,'Cancelled, goods back',null,true);
  insert into t_res select 'final refund closes the invoice as refunded', n ~ '^[0-9a-f-]{36}$' and (select status from pet_invoices where id=invA)='refunded'
    and (select amount_refunded from pet_invoices where id=invA)=2000, coalesce(n,'null');
  insert into t_res select 'return_stock put the 2 products back (stock 10, ledger sale_refund +2)', (select quantity_on_hand from pet_items where id=itm)=10
    and exists (select 1 from pet_stock_movements where reason='sale_refund' and change_qty=2 and reference_id=invA)
    and (select stock_returned from pet_refunds where id=(case when n ~ '^[0-9a-f-]{36}$' then n::uuid end)), (select quantity_on_hand::text from pet_items where id=itm);
  insert into t_res select 'all 20 points are taken back after the full refund (balance 0)', (select points_balance from pet_loyalty_accounts where customer_id=c1)=0
    and (select coalesce(sum(points),0) from pet_loyalty_ledger where reason='refund_reversal' and reference_id=invA)=-20, (select points_balance::text from pet_loyalty_accounts where customer_id=c1);
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invA,'cash',1,'x',null,false);
  insert into t_res select 'a refunded invoice cannot be refunded again', n like 'ERR:INVOICE_NOT_REFUNDABLE%', n;
  n := pg_temp.as_claims(cl1,'authenticated', format('select pet_record_payment(%L,%L,100,null)::text', invA, 'cash'));
  insert into t_res select 'a refunded invoice cannot take a new payment', n like 'ERR:INVOICE_NOT_PAYABLE%', n;
  n := pg_temp.as_claims(cl1,'authenticated', format('select pet_void_invoice(%L,%L)::text', invA, 'x'));
  insert into t_res select 'a refunded invoice cannot be voided', n like 'ERR:INVOICE_HAS_PAYMENTS%', n;

  -- ---- part-paid invoice: refund must be the whole amount paid
  invB := pg_temp.as_claims(cl1,'authenticated', format('select pet_create_invoice(%L,%L,null,null,%L::jsonb,''amount'',0,null,null,%L::jsonb)::text',
    gen_random_uuid(), c1, jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',2)),
    jsonb_build_array(jsonb_build_object('method','cash','amount',800))))::uuid;
  insert into t_res select 'setup: invoice B is part paid (800 of 2000)', (select status from pet_invoices where id=invB)='partial', null;
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invB,'cash',300,'x',null,false);
  insert into t_res select 'part-paid invoice: a partial refund is refused', n like 'ERR:PARTIAL_INVOICE_FULL_REFUND_ONLY%', n;
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invB,'cash',800,'Customer cancelled',null,true);
  insert into t_res select 'part-paid invoice: full refund closes it as refunded; no points or stock involved', n ~ '^[0-9a-f-]{36}$'
    and (select status from pet_invoices where id=invB)='refunded' and (select amount_refunded from pet_invoices where id=invB)=800
    and not (select stock_returned from pet_refunds where id=(case when n ~ '^[0-9a-f-]{36}$' then n::uuid end))
    and not exists (select 1 from pet_loyalty_ledger where reference_id=invB), coalesce(n,'null');

  -- ---- loyalty reversal never goes below the customer's current balance (points already spent)
  invC := pg_temp.as_claims(cl1,'authenticated', format('select pet_create_invoice(%L,%L,null,null,%L::jsonb,''amount'',0,null,null,%L::jsonb)::text',
    gen_random_uuid(), c1, jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',3)),
    jsonb_build_array(jsonb_build_object('method','cash','amount',3000))))::uuid;
  insert into t_res select 'setup: invoice C earned 30 points', (select points_balance from pet_loyalty_accounts where customer_id=c1)=30, (select points_balance::text from pet_loyalty_accounts where customer_id=c1);
  perform pet_loyalty_apply(s1, c1, -27, 'adjustment', 'spent elsewhere', null, null);
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invC,'cash',3000,'Cancelled',null,false);
  insert into t_res select 'reversal is clamped to the balance (3 left, so 3 taken, never negative)', n ~ '^[0-9a-f-]{36}$'
    and (select points_balance from pet_loyalty_accounts where customer_id=c1)=0
    and (select coalesce(sum(points),0) from pet_loyalty_ledger where reason='refund_reversal' and reference_id=invC)=-3, (select points_balance::text from pet_loyalty_accounts where customer_id=c1);

  -- ---- append-only, no direct writes, tenant isolation
  begin update pet_refunds set amount = amount + 1; function_ok := false; exception when others then function_ok := sqlerrm like '%append-only%'; end;
  insert into t_res select 'pet_refunds rows cannot be updated', function_ok, null;
  begin delete from pet_refunds; function_ok := false; exception when others then function_ok := sqlerrm like '%append-only%'; end;
  insert into t_res select 'pet_refunds rows cannot be deleted', function_ok, null;
  n := pg_temp.as_claims(cl1,'authenticated', format('insert into pet_refunds(salon_id,invoice_id,idempotency_key,method,amount,reason) values (%L,%L,%L,''cash'',1,''x'')', s1, invA, gen_random_uuid()));
  insert into t_res select 'CLOSED: a device cannot insert into pet_refunds directly', n like 'ERR:%permission denied%', n;
  n := pg_temp.as_claims(cl1,'authenticated', format('update pet_invoices set amount_refunded = 0 where id = %L', invA));
  insert into t_res select 'CLOSED: a device cannot edit an invoice directly', n like 'ERR:%permission denied%', n;
  n := pg_temp.as_claims(cl1,'authenticated','select count(*)::text from pet_refunds');
  insert into t_res select 'own business sees its refunds', n::int >= 4, n;
  n := pg_temp.as_claims(cl2,'authenticated','select count(*)::text from pet_refunds');
  insert into t_res select 'another business sees none', n = '0', n;
  n := pg_temp.as_claims('{"role":"anon"}','anon','select count(*)::text from pet_refunds');
  insert into t_res select 'anon cannot read pet_refunds', n like 'ERR:%permission denied%', n;

  -- ---- database constraints reject an inconsistent invoice even for the owner role
  begin update pet_invoices set amount_refunded = amount_paid where id = (select id from pet_invoices where status='paid' and salon_id = s2); function_ok := false;
  exception when check_violation then function_ok := true; when others then function_ok := false; end;
  insert into t_res select 'constraint: a paid invoice cannot be fully refunded without becoming refunded', function_ok, null;
  begin update pet_invoices set status='refunded' where id = (select id from pet_invoices where status='paid' and salon_id = s2); function_ok := false;
  exception when check_violation then function_ok := true; when others then function_ok := false; end;
  insert into t_res select 'constraint: status refunded needs amount_refunded = amount_paid', function_ok, null;

  -- ---- lockout still works through this function
  delete from pin_login_attempts where salon_id = s1;
  invX := null;
  insert into pet_invoices(salon_id,customer_id,invoice_number,idempotency_key,status,subtotal,total,amount_paid) values (s1,c1,'INV-9002',gen_random_uuid(),'paid',900,900,900) returning id into invX;
  for i in 1..5 loop perform pg_temp.rf(cl1,'0000',gen_random_uuid(),invX,'cash',100,'x',null,false); end loop;
  insert into t_res select 'five wrong PINs are recorded (not rolled back by the function)', (select count(*) from pin_login_attempts where salon_id=s1 and role='admin' and success=false)=5, null;
  n := pg_temp.rf(cl1,'9999',gen_random_uuid(),invX,'cash',100,'x',null,false);
  insert into t_res select 'locked out: even the right admin PIN is refused', n is null and (select amount_refunded from pet_invoices where id=invX)=0, coalesce(n,'null');

  select count(*) into fails from t_res where ok is not true;
  for n in select format('%s  %s%s', case when ok is true then 'PASS' else 'FAIL' end, name, case when ok is true then '' else '  [got: '||coalesce(got,'null')||']' end) from t_res loop
    raise notice '%', n;
  end loop;
  raise exception 'FAILED=% of % (rolled back)', fails, (select count(*) from t_res);
end $$;
