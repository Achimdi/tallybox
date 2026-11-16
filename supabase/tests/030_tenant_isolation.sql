-- pgTAP: no business can see another business's data, for every role,
-- and suspending a business or turning a user off takes effect at once.

begin;

select plan(57);

-- Two businesses, set up directly (registration itself is tested in 020).
select tests.create_user('dev@tallybox.test', '{"role":"super_admin"}', 'aaaaaaaa-0000-0000-0000-000000000001');
select tests.create_user('owner-a@a.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a1');
select tests.create_user('staff1@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a2');
select tests.create_user('staff2@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a3');
select tests.create_user('owner-b@b.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b1');
select tests.create_user('staff1@b.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b2');
select tests.create_user('stranger@nowhere.test', '{}', 'aaaaaaaa-0000-0000-0000-0000000000c1');

insert into public.businesses (id, name, business_code, owner_id) values
  ('b0000000-0000-0000-0000-00000000000a', 'Shop A', 'shop-a', 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-00000000000b', 'Shop B', 'shop-b', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.profiles (id, business_id, role, username, display_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'owner', null, 'Owner A'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'staff1', 'Staff A1'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'staff2', 'Staff A2'),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'owner', null, 'Owner B'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-00000000000b', 'staff', 'staff1', 'Staff B1');

-- The real auth.sessions table has no default for id, so give one.
insert into auth.sessions (id, user_id) values
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000b1'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000b2');

-- ---------------------------------------------------------------------------
-- Not signed in
-- ---------------------------------------------------------------------------

select tests.authenticate_as_anon();

select throws_ok($$ select * from public.businesses $$, '42501', null, 'a visitor cannot read businesses');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'a visitor cannot read profiles');
select throws_ok($$ select * from public.activation_codes $$, '42501', null, 'a visitor cannot read activation codes');
select throws_ok($$ select public.get_session_state() $$, '42501', null, 'a visitor cannot ask for a session state');
select throws_ok($$ select public.business_code_available('shop-a') $$, '42501', null, 'a visitor cannot probe business codes directly');

-- ---------------------------------------------------------------------------
-- Owner of A
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');

select results_eq(
  $$ select name from public.businesses $$,
  $$ values ('Shop A') $$,
  'owner A sees only business A'
);
select is(
  (select count(*)::int from public.profiles),
  3,
  'owner A sees all three profiles in business A'
);
select is(
  (select count(*)::int from public.profiles where business_id = 'b0000000-0000-0000-0000-00000000000b'),
  0,
  'owner A sees no profiles from business B'
);
select is(
  (select count(*)::int from public.businesses where id = 'b0000000-0000-0000-0000-00000000000b'),
  0,
  'owner A cannot fetch business B even by its id'
);

select throws_ok(
  $$ insert into public.businesses (name, business_code) values ('Hack', 'hack-shop') $$,
  '42501', null, 'owner A cannot insert a business'
);
select throws_ok(
  $$ update public.businesses set name = 'Renamed' $$,
  '42501', null, 'owner A cannot update their business directly'
);
select throws_ok(
  $$ delete from public.businesses $$,
  '42501', null, 'owner A cannot delete a business'
);
select throws_ok(
  $$ update public.profiles set role = 'owner' $$,
  '42501', null, 'owner A cannot edit profiles directly'
);
select throws_ok(
  $$ insert into public.profiles (id, business_id, role, username, display_name)
     values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'sneaky', 'Sneaky') $$,
  '42501', null, 'owner A cannot insert profiles directly'
);
select throws_ok($$ select * from public.activation_codes $$, '42501', null, 'owner A cannot read activation codes');
select throws_ok($$ select * from public.rate_limits $$, '42501', null, 'owner A cannot read rate limits');

-- Functions meant only for Edge Functions
select throws_ok(
  $$ select public.register_business(gen_random_uuid(), gen_random_uuid(), 'a@b.test', 'A', 'Biz', 'biz-code', null, 'UTC', 'TB-2222-2222') $$,
  '42501', null, 'a signed-in user cannot call register_business'
);
select throws_ok(
  $$ select public.admin_set_business_status('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'suspended', 'spite') $$,
  '42501', null, 'a signed-in user cannot call admin_set_business_status'
);
select throws_ok(
  $$ select * from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000001', 'a@b.test') $$,
  '42501', null, 'a signed-in user cannot call admin_generate_activation_code'
);
select throws_ok(
  $$ select public.create_staff_profile('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'sneaky', 'Sneaky') $$,
  '42501', null, 'a signed-in user cannot call create_staff_profile'
);
select throws_ok($$ select public.rate_limit_hit('x', 1, 60) $$, '42501', null, 'a signed-in user cannot call rate_limit_hit');
select throws_ok($$ select public.get_actor('aaaaaaaa-0000-0000-0000-0000000000b1') $$, '42501', null, 'a signed-in user cannot call get_actor');
select throws_ok($$ select private.business_has_access('b0000000-0000-0000-0000-00000000000b') $$, '42501', null, 'a signed-in user cannot probe another business''s access');

-- Super-admin reads, called by someone who is not the super-admin
select throws_ok($$ select * from public.admin_list_businesses() $$, 'P0001', 'not_found', 'an owner gets "not found" from the business list');
select throws_ok($$ select * from public.admin_list_activation_codes() $$, 'P0001', 'not_found', 'an owner gets "not found" from the code list');
select throws_ok($$ select public.admin_platform_counts() $$, 'P0001', 'not_found', 'an owner gets "not found" from the platform counts');

select is(
  public.get_session_state() - 'user_id',
  '{"kind":"member","role":"owner","display_name":"Owner A","username":null,"active":true,"access":"ok",
    "business":{"id":"b0000000-0000-0000-0000-00000000000a","name":"Shop A","business_code":"shop-a","currency_code":"NGN","timezone":"UTC"}}'::jsonb,
  'owner A gets their own session state'
);

-- A token that claims a different business, or the super-admin role
select tests.authenticate_with_claims('aaaaaaaa-0000-0000-0000-0000000000a1', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000b"}');
select is((select count(*)::int from public.businesses), 0, 'a token naming another business sees nothing, not even its own');
select is((select count(*)::int from public.profiles), 0, 'a token naming another business sees no profiles');

select tests.authenticate_with_claims('aaaaaaaa-0000-0000-0000-0000000000a1', '{"role":"super_admin"}');
select throws_ok($$ select * from public.admin_list_businesses() $$, 'P0001', 'not_found', 'claiming to be super-admin in a token is not enough');
select is((select count(*)::int from public.businesses), 0, 'a token without a business sees nothing');

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');

select results_eq($$ select name from public.businesses $$, $$ values ('Shop A') $$, 'staff A1 sees only business A');
select results_eq($$ select display_name from public.profiles $$, $$ values ('Staff A1') $$, 'staff A1 sees only their own profile');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b2');

select results_eq($$ select name from public.businesses $$, $$ values ('Shop B') $$, 'staff B1 sees only business B');
select results_eq($$ select display_name from public.profiles $$, $$ values ('Staff B1') $$, 'staff B1 sees only their own profile');

-- ---------------------------------------------------------------------------
-- A user who has been turned off
-- ---------------------------------------------------------------------------

select tests.clear_authentication();
update public.profiles set active = false where id = 'aaaaaaaa-0000-0000-0000-0000000000a3';
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a3');

select is((select count(*)::int from public.businesses), 0, 'a turned-off user sees no business, with the same token as before');
select is((select count(*)::int from public.profiles), 0, 'a turned-off user sees no profiles');
select is(public.get_session_state(true) ->> 'active', 'false', 'the session state tells the app the account is turned off');

select tests.clear_authentication();
select is(
  (select last_login_at from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000a3'),
  null,
  'a turned-off user''s login is not recorded'
);

-- ---------------------------------------------------------------------------
-- Suspending a business
-- ---------------------------------------------------------------------------

select tests.authenticate_as_service_role();

select throws_ok(
  $$ select public.admin_set_business_status('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000b', 'suspended', 'rival') $$,
  'P0001', 'not_found', 'an owner cannot suspend a business'
);
select throws_ok(
  $$ select public.admin_set_business_status('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'suspended', '  ') $$,
  'P0001', 'validation', 'a suspension needs a reason'
);
select throws_ok(
  $$ select public.admin_set_business_status('aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid(), 'suspended', 'gone') $$,
  'P0001', 'not_found', 'suspending a business that does not exist says so'
);
select lives_ok(
  $$ select public.admin_set_business_status('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'suspended', 'Unpaid') $$,
  'the super-admin can suspend business B'
);
select is(
  public.get_actor('aaaaaaaa-0000-0000-0000-0000000000b1') ->> 'has_access',
  'false',
  'Edge Functions see at once that owner B has no access'
);
select throws_ok(
  $$ select public.staff_precheck('aaaaaaaa-0000-0000-0000-0000000000b1', 'newstaff') $$,
  'P0001', 'business_suspended', 'a suspended business cannot create staff'
);

select tests.clear_authentication();
select results_eq(
  $$ select user_id from auth.sessions $$,
  $$ values ('aaaaaaaa-0000-0000-0000-0000000000a1'::uuid) $$,
  'business B''s users are signed out, business A''s are not'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b1');

select is((select count(*)::int from public.businesses), 0, 'owner B sees nothing while suspended, with the same token as before');
select is((select count(*)::int from public.profiles), 0, 'owner B sees no profiles while suspended');
select is(public.get_session_state() ->> 'access', 'suspended', 'the session state tells the app the business is suspended');
select is(public.get_session_state() -> 'business' ->> 'name', 'Shop B', 'the suspended screen can still name the business');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.businesses), 1, 'suspending B does not affect business A');

select tests.authenticate_as_service_role();
select public.admin_set_business_status('aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'active');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b1');
select results_eq(
  $$ select name, status, suspended_at, suspended_reason from public.businesses $$,
  $$ values ('Shop B', 'active', null::timestamptz, null::text) $$,
  'reactivating gives owner B their business back and clears the suspension note'
);

-- ---------------------------------------------------------------------------
-- Super-admin and strangers
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

select is((select count(*)::int from public.businesses), 0, 'the super-admin reads no tables directly, only through checked functions');
select is(public.get_session_state() ->> 'kind', 'super_admin', 'the session state recognises the super-admin');
select results_eq(
  $$ select name, owner_email, staff_count::int from public.admin_list_businesses() order by name $$,
  $$ values ('Shop A', 'owner-a@a.test', 2), ('Shop B', 'owner-b@b.test', 1) $$,
  'the super-admin can list every business with its owner email and staff count'
);
select is(
  public.admin_platform_counts(),
  '{"businesses":2,"suspended":0,"staff":3,"unused_codes":0}'::jsonb,
  'the super-admin gets simple platform counts'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000c1');
select is(public.get_session_state() ->> 'kind', 'none', 'an Auth user with no profile is recognised as belonging nowhere');

select * from finish();

rollback;
