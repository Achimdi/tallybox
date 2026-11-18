-- pgTAP: the receipt watermark in business settings.

begin;

select plan(14);

select tests.create_user('owner-a@a.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a1');
select tests.create_user('staff@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a2');
select tests.create_user('owner-b@b.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.businesses (id, name, business_code, owner_id) values
  ('b0000000-0000-0000-0000-00000000000a', 'Drinks A', 'drinks-a', 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-00000000000b', 'Shop B', 'shop-b', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.profiles (id, business_id, role, username, display_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'owner', null, 'Owner A'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'ada', 'Ada'),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'owner', null, 'Owner B');

select results_eq(
  $$ select receipt_watermark, receipt_watermark_text, receipt_watermark_logo
     from public.businesses where id = 'b0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('tallybox', null::text, false) $$,
  'a new business has the Tallybox watermark'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select lives_ok(
  $$ select public.update_business_settings('Drinks A', 'NGN', 'Africa/Lagos', '', '', '', 5,
       'custom', '  Drinks   Corner ', true) $$,
  'the owner chooses their own text and logo'
);
select results_eq(
  $$ select receipt_watermark, receipt_watermark_text, receipt_watermark_logo
     from public.businesses where id = 'b0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('custom', 'Drinks Corner', true) $$,
  'saved, with the spaces tidied'
);

select lives_ok(
  $$ select public.update_business_settings('Drinks A', 'NGN', 'Africa/Lagos', '', '', '', 5) $$,
  'an app from before the watermark still saves settings'
);
select results_eq(
  $$ select receipt_watermark, receipt_watermark_text, receipt_watermark_logo
     from public.businesses where id = 'b0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('custom', 'Drinks Corner', true) $$,
  'and the watermark is kept as it was'
);

select lives_ok(
  $$ select public.update_business_settings('Drinks A', 'NGN', 'Africa/Lagos', '', '', '', 5,
       'none', 'Drinks Corner', false) $$,
  'the owner turns the watermark off'
);
select results_eq(
  $$ select receipt_watermark, receipt_watermark_text, receipt_watermark_logo
     from public.businesses where id = 'b0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('none', 'Drinks Corner', false) $$,
  'their words are kept for later'
);

select throws_ok(
  $$ select public.update_business_settings('Drinks A', 'NGN', 'Africa/Lagos', '', '', '', 5,
       'sparkles', null, false) $$,
  'P0001', 'validation', 'only the three kinds are allowed'
);
select throws_ok(
  $$ select public.update_business_settings('Drinks A', 'NGN', 'Africa/Lagos', '', '', '', 5,
       'custom', repeat('x', 41), false) $$,
  'P0001', 'validation', 'the text is 40 characters at most'
);
select throws_ok(
  $$ select public.update_business_settings('Drinks A', 'NGN', 'Africa/Lagos', '', '', '', 5,
       'custom', '   ', false) $$,
  'P0001', 'validation', 'an own watermark needs text or the logo'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select results_eq(
  $$ select receipt_watermark, receipt_watermark_text from public.businesses $$,
  $$ values ('none', 'Drinks Corner') $$,
  'staff can read their own business watermark, for receipts'
);
select throws_ok(
  $$ select public.update_business_settings('Drinks A', 'NGN', 'Africa/Lagos', '', '', '', 5,
       'tallybox', null, false) $$,
  'P0001', 'permission_denied', 'staff cannot change it'
);

select tests.clear_authentication();
select results_eq(
  $$ select receipt_watermark from public.businesses where id = 'b0000000-0000-0000-0000-00000000000b' $$,
  $$ values ('tallybox') $$,
  'another business''s watermark is untouched'
);

select throws_ok(
  $$ update public.businesses set receipt_watermark = 'custom', receipt_watermark_text = null,
       receipt_watermark_logo = false where id = 'b0000000-0000-0000-0000-00000000000b' $$,
  '23514', null, 'the table itself refuses an own watermark with nothing in it'
);

select * from finish();

rollback;
