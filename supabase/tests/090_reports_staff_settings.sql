-- pgTAP: the owner's dashboard and sales report, turning staff off and on,
-- business settings, and the logo bucket and path.

begin;

select plan(46);

-- Business A: owner and two staff. Business B: owner and one staff.
select tests.create_user('owner-a@a.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a1');
select tests.create_user('staff1@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a2');
select tests.create_user('staff2@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a3');
select tests.create_user('owner-b@b.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b1');
select tests.create_user('staff@b.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b2');

insert into public.businesses (id, name, business_code, owner_id) values
  ('b0000000-0000-0000-0000-00000000000a', 'Drinks A', 'drinks-a', 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-00000000000b', 'Shop B', 'shop-b', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.profiles (id, business_id, role, username, display_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'owner', null, 'Owner A'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'ada', 'Ada'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'bola', 'Bola'),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'owner', null, 'Owner B'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-00000000000b', 'staff', 'chidi', 'Chidi');

-- Coke and Fanta share a bottle; bread counts its own stock.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select public.upsert_supply('d0000000-0000-0000-0000-000000000001', 'Bottle', 'bottle', 500, 10, 100);
select public.upsert_item('c0000000-0000-0000-0000-000000000001', 'Coke', null, null, 50000, null, null, 0, false,
  '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1}]');
select public.upsert_item('c0000000-0000-0000-0000-000000000002', 'Fanta', null, null, 40000, null, null, 0, false,
  '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1}]');
select public.upsert_item('c0000000-0000-0000-0000-000000000003', 'Bread', null, null, 120000, null, null, 50, true, '[]');

-- Ada sells 3 Coke (cash) and 1 bread (transfer); Bola sells 2 Fanta; one more Coke is voided.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":3}]',
  'cash', null, true, null, null, null);
select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000003","quantity":1}]',
  'bank_transfer', null, true, null, null, null);
select set_config('tests.voided', public.create_order(gen_random_uuid(),
  '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":1}]', 'cash', null, true, null, null, null)::text, true);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a3');
select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000002","quantity":2}]',
  'card', null, true, null, null, null);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select public.void_order(current_setting('tests.voided')::uuid, 'Customer changed their mind');

-- ---------------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------------

select set_config('tests.dash', public.owner_dashboard()::text, true);
select tests.clear_authentication();
select set_config('tests.today', private.business_today('b0000000-0000-0000-0000-00000000000a')::text, true);
select is(
  (current_setting('tests.dash')::jsonb -> 'today') - 'date_key',
  '{"sales":350000,"orders":3,"voided":1,"voided_total":50000,
    "by_payment_method":{"cash":150000,"bank_transfer":120000,"card":80000}}'::jsonb,
  'today adds up completed orders, with the void counted apart'
);
select is(
  (current_setting('tests.dash')::jsonb -> 'yesterday' ->> 'sales')::bigint,
  0::bigint,
  'a day with no orders is all zeros'
);
select is(
  (current_setting('tests.dash')::jsonb #>> '{yesterday,date_key}')::date,
  current_setting('tests.today')::date - 1,
  'yesterday is the business''s own yesterday'
);
select is(
  (select jsonb_agg(e ->> 'name') from jsonb_array_elements(current_setting('tests.dash')::jsonb -> 'top_items_today') e),
  '["Coke", "Bread", "Fanta"]'::jsonb,
  'best sellers by amount sold, the voided Coke not counted'
);
select is(
  current_setting('tests.dash')::jsonb -> 'top_items_today' -> 0,
  '{"item_id":"c0000000-0000-0000-0000-000000000001","name":"Coke","quantity":3,"sales":150000}'::jsonb,
  'each best seller has its quantity and amount'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.owner_dashboard() $$, 'P0001', 'permission_denied',
  'staff never see sales totals');
select tests.authenticate_as_anon();
select throws_ok($$ select public.owner_dashboard() $$, '42501', null,
  'a visitor cannot ask at all');

-- ---------------------------------------------------------------------------
-- Sales report
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select set_config('tests.report', public.sales_report(
  current_setting('tests.today')::date - 2, current_setting('tests.today')::date)::text, true);

select is(
  current_setting('tests.report')::jsonb - '{by_payment_method,by_staff,by_day,items,supply_use}'::text[],
  '{"sales":350000,"orders":3,"voided":1,"voided_total":50000}'::jsonb,
  'the range adds up completed orders and counts voids apart'
);
select is(
  current_setting('tests.report')::jsonb -> 'by_payment_method',
  '{"cash":{"sales":150000,"orders":1},"bank_transfer":{"sales":120000,"orders":1},
    "card":{"sales":80000,"orders":1}}'::jsonb,
  'every payment method is listed, with amount and count'
);
select is(
  (select jsonb_agg(jsonb_build_object('name', e ->> 'staff_name', 'sales', (e ->> 'sales')::bigint))
   from jsonb_array_elements(current_setting('tests.report')::jsonb -> 'by_staff') e),
  '[{"name":"Ada","sales":270000},{"name":"Bola","sales":80000}]'::jsonb,
  'staff by amount sold, best first'
);
select is(
  current_setting('tests.report')::jsonb -> 'by_day',
  jsonb_build_array(jsonb_build_object('date_key', current_setting('tests.today'), 'sales', 350000, 'orders', 3)),
  'only days with sales come back; the app fills in quiet days'
);
select is(
  jsonb_array_length(current_setting('tests.report')::jsonb -> 'items'),
  3,
  'every item sold is listed (the app adds the ones that sold nothing)'
);
select is(
  (select jsonb_agg(jsonb_build_object('item', e ->> 'source_item_name', 'used', (e ->> 'used')::int)
     order by e ->> 'source_item_name')
   from jsonb_array_elements(current_setting('tests.report')::jsonb -> 'supply_use') e),
  '[{"item":"Coke","used":3},{"item":"Fanta","used":2}]'::jsonb,
  'bottles used per item, from completed orders only: the voided Coke used none'
);
select is(
  (public.sales_report(current_setting('tests.today')::date + 1, current_setting('tests.today')::date + 2) ->> 'orders')::int,
  0,
  'a range with no orders is all zeros'
);
select throws_ok(
  $$ select public.sales_report(current_setting('tests.today')::date, current_setting('tests.today')::date - 1) $$,
  'P0001', 'validation', 'a range must not end before it starts'
);
select throws_ok(
  $$ select public.sales_report(current_setting('tests.today')::date - 366, current_setting('tests.today')::date) $$,
  'P0001', 'validation', 'a range covers at most 366 days'
);
select lives_ok(
  $$ select public.sales_report(current_setting('tests.today')::date - 365, current_setting('tests.today')::date) $$,
  'exactly 366 days is allowed'
);
select throws_ok($$ select public.sales_report(null, null) $$, 'P0001', 'validation',
  'a range needs both ends');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b1');
select is(
  (public.sales_report(current_setting('tests.today')::date - 2, current_setting('tests.today')::date) ->> 'orders')::int,
  0,
  'another business sees none of these sales'
);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.sales_report(current_setting('tests.today')::date, current_setting('tests.today')::date) $$,
  'P0001', 'permission_denied', 'staff never see reports'
);

-- ---------------------------------------------------------------------------
-- Staff off and on
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.set_staff_active('aaaaaaaa-0000-0000-0000-0000000000a3', false) $$,
  'P0001', 'permission_denied', 'staff cannot turn accounts off');

select tests.clear_authentication();
-- The real auth.sessions table has no default for id, so give one.
insert into auth.sessions (id, user_id) values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a2');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.set_staff_active('aaaaaaaa-0000-0000-0000-0000000000a2', false) $$,
  'the owner turns Ada''s account off');
select tests.clear_authentication();
select is((select active from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000a2'), false,
  'her profile is marked off');
select is((select count(*)::int from auth.sessions where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a2'), 0,
  'and she is signed out everywhere');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.items), 0, 'with her old token she can read nothing');
select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000003","quantity":1}]',
       'cash', null, true, null, null, null) $$,
  'P0001', 'account_disabled', 'and cannot sell'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.set_staff_active('aaaaaaaa-0000-0000-0000-0000000000a2', true) $$,
  'the owner turns it back on');
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select ok((select count(*) from public.items) > 0, 'and she can read the shop again');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.set_staff_active('aaaaaaaa-0000-0000-0000-0000000000b2', false) $$,
  'P0001', 'not_found', 'an owner cannot touch another business''s staff');
select throws_ok($$ select public.set_staff_active('aaaaaaaa-0000-0000-0000-0000000000a1', false) $$,
  'P0001', 'not_found', 'nor turn off their own owner account this way');

-- The reset-password Edge Function's check.
select tests.authenticate_as_service_role();
select lives_ok(
  $$ select public.staff_reset_precheck('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a3') $$,
  'an owner may reset their own staff member''s password'
);
select throws_ok(
  $$ select public.staff_reset_precheck('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000b2') $$,
  'P0001', 'not_found', 'but not another business''s'
);
select throws_ok(
  $$ select public.staff_reset_precheck('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-0000000000a3') $$,
  'P0001', 'permission_denied', 'and staff may not reset anyone'
);
select tests.clear_authentication();
select ok(
  not has_function_privilege('authenticated', 'public.staff_reset_precheck(uuid, uuid)', 'execute'),
  'the browser cannot call the reset check'
);

-- ---------------------------------------------------------------------------
-- Business settings
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select lives_ok(
  $$ select public.update_business_settings(' Drinks   Corner ', 'ghs', 'Africa/Accra', ' 1 New Road ', '', 'Thanks!', 7) $$,
  'the owner saves new settings'
);
select results_eq(
  $$ select name, currency_code, timezone, address, phone, receipt_footer, default_low_stock_level
     from public.businesses where id = 'b0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('Drinks Corner', 'GHS', 'Africa/Accra', '1 New Road', null::text, 'Thanks!', 7) $$,
  'tidied: spaces collapsed, currency upper case, blanks become empty'
);
select throws_ok($$ select public.update_business_settings('Drinks', 'XYZW', 'Africa/Accra', '', '', '', 7) $$,
  'P0001', 'validation', 'a currency is three letters');
select throws_ok($$ select public.update_business_settings('Drinks', 'GHS', 'Mars/Olympus', '', '', '', 7) $$,
  'P0001', 'validation', 'a time zone must be a real one');
select throws_ok($$ select public.update_business_settings('D', 'GHS', 'Africa/Accra', '', '', '', 7) $$,
  'P0001', 'validation', 'a name has at least two characters');
select throws_ok($$ select public.update_business_settings('Drinks', 'GHS', 'Africa/Accra', '', '', '', -1) $$,
  'P0001', 'validation', 'the default low-stock level is not negative');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.update_business_settings('Drinks', 'GHS', 'Africa/Accra', '', '', '', 7) $$,
  'P0001', 'permission_denied', 'staff cannot change settings');

-- ---------------------------------------------------------------------------
-- Logo
-- ---------------------------------------------------------------------------

select tests.clear_authentication();
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'logos' $$,
  $$ values (true, 307200::bigint, array['image/png', 'image/jpeg', 'image/webp']) $$,
  'the logo bucket is public to read, 300 KB at most, pictures only'
);

select tests.authenticate_as_service_role();
select is(
  public.set_business_logo('aaaaaaaa-0000-0000-0000-0000000000a1',
    'b0000000-0000-0000-0000-00000000000a/0f0e0d0c-0b0a-4908-8706-050403020100.png'),
  null,
  'the first logo replaces nothing'
);
select is(
  public.set_business_logo('aaaaaaaa-0000-0000-0000-0000000000a1', null),
  'b0000000-0000-0000-0000-00000000000a/0f0e0d0c-0b0a-4908-8706-050403020100.png',
  'removing it hands back the old file, for the function to delete'
);
select throws_ok(
  $$ select public.set_business_logo('aaaaaaaa-0000-0000-0000-0000000000a1',
       'b0000000-0000-0000-0000-00000000000b/0f0e0d0c-0b0a-4908-8706-050403020100.png') $$,
  'P0001', 'validation', 'a logo path must be inside the business''s own folder'
);
select tests.clear_authentication();
select ok(
  not has_function_privilege('authenticated', 'public.set_business_logo(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.owner_precheck(uuid)', 'execute'),
  'the browser cannot set a logo path or run the owner check'
);

select * from finish();

rollback;
