-- pgTAP: activation codes, business registration, staff creation and rate limiting.

begin;

select plan(50);

-- People
select tests.create_user('dev@tallybox.test', '{"role":"super_admin"}', 'aaaaaaaa-0000-0000-0000-000000000001');
select tests.create_user(
  'ada@shop.test',
  '{"role":"owner","business_id":"b0000000-0000-0000-0000-000000000001"}',
  'aaaaaaaa-0000-0000-0000-000000000002'
);
select tests.create_user(
  'bola@other.test',
  '{"role":"owner","business_id":"b0000000-0000-0000-0000-000000000002"}',
  'aaaaaaaa-0000-0000-0000-000000000003'
);
select tests.create_user('nobody@nowhere.test', '{}', 'aaaaaaaa-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------------
-- Activation codes
-- ---------------------------------------------------------------------------

select tests.authenticate_as_service_role();

select set_config(
  'tests.code',
  (
    select code
    from public.admin_generate_activation_code(
      'aaaaaaaa-0000-0000-0000-000000000001', '  Ada@Shop.Test ', 'Ada''s pharmacy', 7
    )
  ),
  true
);

select matches(
  current_setting('tests.code'),
  '^TB-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$',
  'a code looks like TB-7K4M-X9QD and never contains 0, O, 1 or I'
);

select tests.clear_authentication();

select is(
  (select count(*)::int from public.activation_codes where code_hash like '%' || current_setting('tests.code') || '%'),
  0,
  'the code itself is not stored'
);
select is(
  (select count(*)::int from public.activation_codes where code_hash = encode(sha256(convert_to(replace(current_setting('tests.code'), '-', ''), 'UTF8')), 'hex')),
  1,
  'only a SHA-256 hash of the code is stored'
);
select is(
  (select owner_email from public.activation_codes limit 1),
  'ada@shop.test',
  'the owner email is stored trimmed and lowercase'
);
select ok(
  (select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.activation_codes limit 1),
  'a code expires after 7 days by default'
);

select tests.authenticate_as_service_role();

select is(
  public.validate_activation_code(current_setting('tests.code'), 'ADA@shop.test'),
  'ok',
  'the right code and email are accepted, whatever the letter case of the email'
);
select is(
  public.validate_activation_code(lower(replace(current_setting('tests.code'), '-', ' ')), 'ada@shop.test'),
  'ok',
  'a code typed in lowercase or with spaces still matches'
);
select is(
  public.validate_activation_code(current_setting('tests.code'), 'someone-else@shop.test'),
  'activation_code_invalid',
  'a real code with the wrong email is refused'
);
select is(
  public.validate_activation_code('TB-2222-2222', 'ada@shop.test'),
  'activation_code_invalid',
  'a code that does not exist gets the same answer as a wrong email'
);

select throws_ok(
  $$ select * from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000002', 'x@y.test') $$,
  'P0001', 'not_found',
  'an owner cannot generate activation codes'
);
select throws_ok(
  $$ select * from public.admin_generate_activation_code(null, 'x@y.test') $$,
  'P0001', 'not_found',
  'nobody cannot generate activation codes'
);
select throws_ok(
  $$ select * from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000001', 'not-an-email') $$,
  'P0001', 'validation',
  'a code needs a real-looking owner email'
);
select throws_ok(
  $$ select * from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000001', 'x@y.test', null, 400) $$,
  'P0001', 'validation',
  'a code cannot last longer than 90 days'
);

-- ---------------------------------------------------------------------------
-- Business code rules
-- ---------------------------------------------------------------------------

select ok(public.business_code_available('adas-pharmacy'), 'a normal business code is available');
select ok(public.business_code_available('  Adas-Pharmacy '), 'availability ignores case and outer spaces');
select ok(not public.business_code_available('ab'), 'a business code needs at least 3 characters');
select ok(not public.business_code_available('this-code-is-far-too-long'), 'a business code has at most 20 characters');
select ok(not public.business_code_available('-shop'), 'a business code cannot start with a hyphen');
select ok(not public.business_code_available('my--shop'), 'a business code cannot have two hyphens together');
select ok(not public.business_code_available('my shop'), 'a business code cannot contain spaces');
select ok(not public.business_code_available('admin'), 'reserved words cannot be business codes');

-- ---------------------------------------------------------------------------
-- Registration
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.register_business(
    'b0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
    'wrong@shop.test', 'Ada Obi', 'Ada''s Pharmacy', 'adas-pharmacy', null, 'Africa/Lagos',
    current_setting('tests.code')) $$,
  'P0001', 'activation_code_invalid',
  'registration is refused when the email does not match the code'
);

select is(
  public.register_business(
    'b0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
    'Ada@Shop.test', ' Ada Obi ', ' Ada''s Pharmacy ', 'Adas-Pharmacy', ' 0801 234 5678 ', 'Africa/Lagos',
    current_setting('tests.code')
  ),
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'a valid code and matching email register the business'
);

select tests.clear_authentication();

select results_eq(
  $$ select name, business_code, status, plan, subscription_status, timezone, phone, owner_id
     from public.businesses where id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values ('Ada''s Pharmacy', 'adas-pharmacy', 'active', 'standard', 'comped', 'Africa/Lagos',
     '0801 234 5678', 'aaaaaaaa-0000-0000-0000-000000000002'::uuid) $$,
  'the business is active, comped, on the standard plan, with tidy values'
);
select results_eq(
  $$ select business_id, role, username, display_name, active
     from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  $$ values ('b0000000-0000-0000-0000-000000000001'::uuid, 'owner', null::text, 'Ada Obi', true) $$,
  'the owner profile is created in the same step'
);
select results_eq(
  $$ select status, used_by_business_id, used_at is not null from public.activation_codes
     where owner_email = 'ada@shop.test' $$,
  $$ values ('used', 'b0000000-0000-0000-0000-000000000001'::uuid, true) $$,
  'the code is marked used and linked to the business'
);

select tests.authenticate_as_service_role();

select throws_ok(
  $$ select public.register_business(
    'b0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000004',
    'ada@shop.test', 'Ada Obi', 'Second Shop', 'second-shop', null, 'UTC',
    current_setting('tests.code')) $$,
  'P0001', 'activation_code_used',
  'a code works only once'
);
select ok(public.business_code_available('second-shop'), 'the refused registration created nothing');
select ok(not public.business_code_available('adas-pharmacy'), 'a taken business code is no longer available');

-- A second code, for Bola.
select set_config(
  'tests.code2',
  (select code from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000001', 'bola@other.test')),
  true
);

select throws_ok(
  $$ select public.register_business(
    'b0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003',
    'bola@other.test', 'Bola Ade', 'Bola Foods', 'adas-pharmacy', null, 'UTC',
    current_setting('tests.code2')) $$,
  'P0001', 'business_code_taken',
  'two businesses cannot share a business code'
);
select throws_ok(
  $$ select public.register_business(
    'b0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003',
    'bola@other.test', 'Bola Ade', 'Bola Foods', 'Admin', null, 'UTC',
    current_setting('tests.code2')) $$,
  'P0001', 'business_code_invalid',
  'a reserved business code is refused at registration too'
);
select is(
  public.validate_activation_code(current_setting('tests.code2'), 'bola@other.test'),
  'ok',
  'a failed registration leaves the code unused, so the owner can try again'
);

-- Expired
select tests.clear_authentication();
update public.activation_codes set expires_at = now() - interval '1 minute' where owner_email = 'bola@other.test';
select tests.authenticate_as_service_role();

select throws_ok(
  $$ select public.register_business(
    'b0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003',
    'bola@other.test', 'Bola Ade', 'Bola Foods', 'bola-foods', null, 'UTC',
    current_setting('tests.code2')) $$,
  'P0001', 'activation_code_expired',
  'an expired code is refused, and says so to the person it was made for'
);

-- Revoked
select set_config(
  'tests.code3',
  (select code from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000001', 'bola@other.test')),
  true
);
select tests.clear_authentication();
select set_config(
  'tests.code3_id',
  (select id::text from public.activation_codes where code_hash = private.hash_activation_code(current_setting('tests.code3'))),
  true
);
select tests.authenticate_as_service_role();

select throws_ok(
  $$ select public.admin_revoke_activation_code('aaaaaaaa-0000-0000-0000-000000000002', current_setting('tests.code3_id')::uuid) $$,
  'P0001', 'not_found',
  'an owner cannot revoke codes'
);
select lives_ok(
  $$ select public.admin_revoke_activation_code('aaaaaaaa-0000-0000-0000-000000000001', current_setting('tests.code3_id')::uuid) $$,
  'the super-admin can revoke an unused code'
);
select throws_ok(
  $$ select public.register_business(
    'b0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003',
    'bola@other.test', 'Bola Ade', 'Bola Foods', 'bola-foods', null, 'UTC',
    current_setting('tests.code3')) $$,
  'P0001', 'activation_code_revoked',
  'a revoked code is refused'
);
select throws_ok(
  $$ select public.admin_revoke_activation_code('aaaaaaaa-0000-0000-0000-000000000001', current_setting('tests.code3_id')::uuid) $$,
  'P0001', 'conflict',
  'a code can only be revoked while it is unused'
);
select throws_ok(
  $$ select public.admin_revoke_activation_code('aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid()) $$,
  'P0001', 'not_found',
  'revoking a code that does not exist says so'
);

-- A working registration for Bola, with a timezone Postgres does not know.
select set_config(
  'tests.code4',
  (select code from public.admin_generate_activation_code('aaaaaaaa-0000-0000-0000-000000000001', 'bola@other.test')),
  true
);
select lives_ok(
  $$ select public.register_business(
    'b0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003',
    'bola@other.test', 'Bola Ade', 'Bola Foods', 'bola-foods', null, 'Mars/Olympus',
    current_setting('tests.code4')) $$,
  'a second business registers with its own code'
);
select tests.clear_authentication();
select is(
  (select timezone from public.businesses where business_code = 'bola-foods'),
  'UTC',
  'an unknown timezone falls back to UTC'
);

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

select tests.create_user(
  'chidi@adas-pharmacy.staff.tallybox.invalid',
  '{"role":"staff","business_id":"b0000000-0000-0000-0000-000000000001"}',
  'aaaaaaaa-0000-0000-0000-000000000005'
);
select tests.create_user(
  'chidi@bola-foods.staff.tallybox.invalid',
  '{"role":"staff","business_id":"b0000000-0000-0000-0000-000000000002"}',
  'aaaaaaaa-0000-0000-0000-000000000006'
);
select tests.create_user('dupe@adas-pharmacy.staff.tallybox.invalid', '{}', 'aaaaaaaa-0000-0000-0000-000000000007');

select tests.authenticate_as_service_role();

select is(
  public.staff_precheck('aaaaaaaa-0000-0000-0000-000000000002', ' Chidi '),
  '{"business_id":"b0000000-0000-0000-0000-000000000001","business_code":"adas-pharmacy","username":"chidi"}'::jsonb,
  'an owner can prepare a staff account, and gets the business code for the sign-in address'
);
select throws_ok(
  $$ select public.staff_precheck('aaaaaaaa-0000-0000-0000-000000000002', 'x') $$,
  'P0001', 'username_invalid',
  'a username needs 3 to 20 simple characters'
);
select throws_ok(
  $$ select public.staff_precheck('aaaaaaaa-0000-0000-0000-000000000004', 'chidi') $$,
  'P0001', 'permission_denied',
  'someone without a business cannot create staff'
);

select is(
  public.create_staff_profile(
    'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'Chidi', ' Chidi Eze '
  ),
  'aaaaaaaa-0000-0000-0000-000000000005'::uuid,
  'the owner creates a staff profile in their own business'
);
select throws_ok(
  $$ select public.staff_precheck('aaaaaaaa-0000-0000-0000-000000000002', 'chidi') $$,
  'P0001', 'username_taken',
  'a username can be used once per business'
);
select throws_ok(
  $$ select public.create_staff_profile(
    'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000007', 'chidi', 'Other Chidi') $$,
  'P0001', 'username_taken',
  'the duplicate is refused even if two requests race past the first check'
);
select lives_ok(
  $$ select public.create_staff_profile(
    'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000006', 'chidi', 'Chidi B') $$,
  'another business can use the same username'
);
select throws_ok(
  $$ select public.staff_precheck('aaaaaaaa-0000-0000-0000-000000000005', 'emeka') $$,
  'P0001', 'permission_denied',
  'staff cannot create staff'
);

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

select is(
  array[
    public.rate_limit_hit('test:key-a', 3, 600),
    public.rate_limit_hit('test:key-a', 3, 600),
    public.rate_limit_hit('test:key-a', 3, 600),
    public.rate_limit_hit('test:key-a', 3, 600)
  ],
  array[true, true, true, false],
  'the fourth attempt within the window is refused when the limit is three'
);
select ok(public.rate_limit_hit('test:key-b', 3, 600), 'each key is counted separately');

select * from finish();

rollback;
