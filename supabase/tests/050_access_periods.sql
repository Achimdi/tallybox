-- pgTAP: access periods. A code carries an access length, registering sets the
-- business's access end date, and after the end date plus a short grace period
-- the business is locked until the super-admin extends it. Nothing is deleted.

begin;

select plan(50);

select tests.create_user('dev@tallybox.test', '{"role":"super_admin"}', 'aaaaaaaa-0000-0000-0000-000000000001');
select tests.create_user('owner-a@a.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a1');
select tests.create_user('staff1@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a2');
select tests.create_user('owner-b@b.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b1');
-- Two people about to register.
select tests.create_user('ada@shop.test', '{}', 'aaaaaaaa-0000-0000-0000-0000000000d1');
select tests.create_user('bola@shop.test', '{}', 'aaaaaaaa-0000-0000-0000-0000000000d2');

insert into public.businesses (id, name, business_code, owner_id) values
  ('b0000000-0000-0000-0000-00000000000a', 'Shop A', 'shop-a', 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-00000000000b', 'Shop B', 'shop-b', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.profiles (id, business_id, role, username, display_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'owner', null, 'Owner A'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'staff1', 'Staff A1'),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'owner', null, 'Owner B');

-- ---------------------------------------------------------------------------
-- Codes carry an access length
-- ---------------------------------------------------------------------------

select tests.authenticate_as_service_role();

select set_config(
  'tests.code90',
  (select code from public.admin_generate_activation_code(
    'aaaaaaaa-0000-0000-0000-000000000001', 'ada@shop.test', 'Ada', 7, 90)),
  true
);
select set_config(
  'tests.code_open',
  (select code from public.admin_generate_activation_code(
    'aaaaaaaa-0000-0000-0000-000000000001', 'bola@shop.test', 'Bola', 7, null)),
  true
);

select is(
  (select access_days from public.admin_generate_activation_code(
    'aaaaaaaa-0000-0000-0000-000000000001', 'default@shop.test')),
  30,
  'a code gets 30 days of access when no length is given'
);
select throws_ok(
  $$ select * from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000001', 'x@y.test', null, 7, 0) $$,
  'P0001', 'validation', 'an access length of 0 days is refused'
);
select throws_ok(
  $$ select * from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000001', 'x@y.test', null, 7, 3651) $$,
  'P0001', 'validation', 'an access length over ten years is refused'
);

select tests.clear_authentication();

select results_eq(
  $$ select owner_email, access_days from public.activation_codes order by owner_email $$,
  $$ values ('ada@shop.test', 90), ('bola@shop.test', null::integer), ('default@shop.test', 30) $$,
  'the access length is stored with the code, and null means open-ended'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
select results_eq(
  $$ select owner_email, access_days from public.admin_list_activation_codes() order by owner_email $$,
  $$ values ('ada@shop.test', 90), ('bola@shop.test', null::integer), ('default@shop.test', 30) $$,
  'the super-admin sees each code''s access length'
);

-- ---------------------------------------------------------------------------
-- Registering sets the access end date
-- ---------------------------------------------------------------------------

select tests.authenticate_as_service_role();

select public.register_business(
  'b0000000-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d1',
  'ada@shop.test', 'Ada Eze', 'Ada Pharmacy', 'ada-pharmacy', null, 'Africa/Lagos',
  current_setting('tests.code90')
);
select public.register_business(
  'b0000000-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000d2',
  'bola@shop.test', 'Bola Ade', 'Bola Foods', 'bola-foods', null, 'Africa/Lagos',
  current_setting('tests.code_open')
);

select tests.clear_authentication();

select is(
  (select subscription_ends_at from public.businesses where id = 'b0000000-0000-0000-0000-0000000000d1'),
  now() + interval '90 days',
  'a business registered with a 90-day code has access for 90 days from registration'
);
select is(
  (select subscription_ends_at from public.businesses where id = 'b0000000-0000-0000-0000-0000000000d2'),
  null,
  'a business registered with an open-ended code has no end date'
);

-- ---------------------------------------------------------------------------
-- The access rule: end date, grace period, lock
-- ---------------------------------------------------------------------------

select is(private.business_access_state('b0000000-0000-0000-0000-00000000000a'), 'ok', 'open-ended access is ok');

update public.businesses set subscription_ends_at = now() + interval '1 day' where id = 'b0000000-0000-0000-0000-00000000000a';
select is(private.business_access_state('b0000000-0000-0000-0000-00000000000a'), 'ok', 'access that ends tomorrow is ok');

update public.businesses set subscription_ends_at = now() - interval '2 days 23 hours' where id = 'b0000000-0000-0000-0000-00000000000a';
select is(private.business_access_state('b0000000-0000-0000-0000-00000000000a'), 'ok', 'inside the 3-day grace period the business still works');
select ok(private.business_has_access('b0000000-0000-0000-0000-00000000000a'), 'and still has access');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.businesses), 1, 'the owner still sees the business during the grace period');
select is(
  public.get_session_state() #>> '{business,access_ends_at}' is not null,
  true,
  'the session state tells the app when access ends, for the banner'
);
select tests.clear_authentication();

update public.businesses set subscription_ends_at = now() - interval '3 days' where id = 'b0000000-0000-0000-0000-00000000000a';
select is(private.business_access_state('b0000000-0000-0000-0000-00000000000a'), 'ended', 'when the grace period runs out, access has ended');
select ok(not private.business_has_access('b0000000-0000-0000-0000-00000000000a'), 'and the business has no access');

-- Locked: Row Level Security shows nothing, to the owner and to staff alike.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.businesses), 0, 'the owner of an ended business sees no business');
select is((select count(*)::int from public.profiles), 0, 'and no profiles');
select is(public.get_session_state() ->> 'access', 'ended', 'the session state says access has ended, so the app can explain');

select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Tea', null, null, 100, null, null) $$,
  'P0001', 'access_ended', 'the owner of an ended business can change nothing, and is told why'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.businesses), 0, 'staff of an ended business see no business');
select is(public.get_session_state() ->> 'access', 'ended', 'and are told access has ended');

-- Another business is untouched.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.businesses), 1, 'another business keeps working');
select tests.clear_authentication();

-- Nothing was deleted.
select is((select count(*)::int from public.profiles where business_id = 'b0000000-0000-0000-0000-00000000000a'), 2, 'an ended business keeps all its records');

-- A suspension is reported as a suspension, even if access has also ended.
update public.businesses set status = 'suspended', suspended_at = now(), suspended_reason = 'test' where id = 'b0000000-0000-0000-0000-00000000000a';
select is(private.business_access_state('b0000000-0000-0000-0000-00000000000a'), 'suspended', 'suspended wins over ended');
update public.businesses set status = 'active', suspended_at = null, suspended_reason = null where id = 'b0000000-0000-0000-0000-00000000000a';

-- ---------------------------------------------------------------------------
-- The super-admin's filter
-- ---------------------------------------------------------------------------

select is(private.access_filter(null), 'ok', 'open-ended access is never "ending soon"');
select is(private.access_filter(now() + interval '8 days'), 'ok', '8 days left is fine');
select is(private.access_filter(now() + interval '7 days'), 'ending_soon', '7 days left is ending soon');
select is(private.access_filter(now() + interval '1 hour'), 'ending_soon', 'the last day is ending soon');
select is(private.access_filter(now() - interval '1 day'), 'ending_soon', 'the grace period still counts as ending soon');
select is(private.access_filter(now() - interval '4 days'), 'ended', 'past the grace period it has ended');

-- ---------------------------------------------------------------------------
-- Extending access
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select public.admin_extend_access('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 365) $$,
  '42501', null, 'a signed-in user cannot extend access, even naming the super-admin'
);

select tests.authenticate_as_service_role();
select throws_ok(
  $$ select public.admin_extend_access('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 365) $$,
  'P0001', 'not_found', 'an owner cannot extend their own access through the function'
);
select throws_ok(
  $$ select public.admin_extend_access('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 0) $$,
  'P0001', 'validation', 'extending by 0 days is refused'
);
select throws_ok(
  $$ select public.admin_extend_access('aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid(), 30) $$,
  'P0001', 'not_found', 'extending an unknown business is refused'
);

-- Shop A ended three days ago: extending starts from today.
select is(
  public.admin_extend_access('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 30),
  now() + interval '30 days',
  'extending after access ended counts from today'
);
-- Extending early adds to the current end date, so no days are lost.
select is(
  public.admin_extend_access('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 90),
  now() + interval '120 days',
  'extending early adds days to the current end date'
);
select is(
  public.admin_extend_access('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 30),
  now() + interval '30 days',
  'extending open-ended access gives it an end date counted from today'
);
select is(
  public.admin_extend_access('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', null),
  null,
  'extending with no length makes access open-ended'
);

-- The extended business works again straight away.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.businesses), 1, 'the owner sees the business again once access is extended');
select is(public.get_session_state() ->> 'access', 'ok', 'and the session state is ok again');

-- ---------------------------------------------------------------------------
-- What the super-admin sees
-- ---------------------------------------------------------------------------

select tests.clear_authentication();
update public.businesses set subscription_ends_at = now() + interval '5 days' where id = 'b0000000-0000-0000-0000-0000000000d1';
update public.businesses set subscription_ends_at = now() - interval '10 days' where id = 'b0000000-0000-0000-0000-0000000000d2';

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
select results_eq(
  $$ select name, owner_name, access_filter from public.admin_list_businesses() order by name $$,
  $$ values
    ('Ada Pharmacy', 'Ada Eze', 'ending_soon'),
    ('Bola Foods', 'Bola Ade', 'ended'),
    ('Shop A', 'Owner A', 'ok'),
    ('Shop B', 'Owner B', 'ok') $$,
  'the business list shows each owner and whether access is ok, ending soon or ended'
);
select is(
  (public.admin_platform_counts() ->> 'ending_soon')::int,
  1,
  'the platform counts say how many businesses end soon'
);
select is(
  (public.admin_platform_counts() ->> 'access_ended')::int,
  1,
  'and how many have ended'
);
select is(
  public.admin_get_business('b0000000-0000-0000-0000-00000000000a')
    - 'created_at' - 'access_ends_at' - 'last_activity_at',
  '{"id":"b0000000-0000-0000-0000-00000000000a","name":"Shop A","business_code":"shop-a","status":"active",
    "access_filter":"ok","owner_name":"Owner A","owner_email":"owner-a@a.test","staff_count":1,
    "active_staff_count":1,"suspended_at":null,"suspended_reason":null,"phone":null,"timezone":"UTC",
    "currency_code":"NGN","order_count":0,"order_count_today":0}'::jsonb,
  'the super-admin can open one business in detail'
);
select throws_ok(
  $$ select public.admin_get_business(gen_random_uuid()) $$,
  'P0001', 'not_found', 'an unknown business is "not found"'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select public.admin_get_business('b0000000-0000-0000-0000-00000000000b') $$,
  'P0001', 'not_found', 'an owner gets "not found" from the business detail, even for another business'
);

-- ---------------------------------------------------------------------------
-- The owner's email, for a password-reset link
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.admin_owner_email('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'a signed-in user cannot look up an owner''s email'
);

select tests.authenticate_as_service_role();
select is(
  public.admin_owner_email('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b'),
  'owner-b@b.test',
  'the super-admin can get the owner''s email to make a reset link'
);
select throws_ok(
  $$ select public.admin_owner_email('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000b') $$,
  'P0001', 'not_found', 'an owner cannot, even through the function'
);
select throws_ok(
  $$ select public.admin_owner_email('aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid()) $$,
  'P0001', 'not_found', 'an unknown business has no owner email'
);

select * from finish();

rollback;
