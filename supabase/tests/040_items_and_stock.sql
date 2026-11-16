-- pgTAP: items, cost prices, restocks, adjustments, the append-only ledger,
-- who can read what, and the rule that quantity always equals the ledger.

begin;

select plan(72);

-- ---------------------------------------------------------------------------
-- Two businesses: A (owner, staff) and B (owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner-a@a.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a1');
select tests.create_user('staff-a@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a2');
select tests.create_user('owner-b@b.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.businesses (id, name, business_code, owner_id, default_low_stock_level) values
  ('b0000000-0000-0000-0000-00000000000a', 'Shop A', 'shop-a', 'aaaaaaaa-0000-0000-0000-0000000000a1', 5),
  ('b0000000-0000-0000-0000-00000000000b', 'Shop B', 'shop-b', 'aaaaaaaa-0000-0000-0000-0000000000b1', 3);

insert into public.profiles (id, business_id, role, username, display_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'owner', null, 'Owner A'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'staff1', 'Staff A'),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'owner', null, 'Owner B');

-- Item ids, chosen by "the app"
--   c...01  Paracetamol (A)     c...02  Water (A)     c...0b  Bread (B)

-- ---------------------------------------------------------------------------
-- Creating and editing items
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');

select is(
  public.upsert_item('c0000000-0000-0000-0000-000000000001', '  Paracetamol   500mg ', ' Medicine ', 'pack', 45000, 30000, 10, 48),
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'the owner creates an item'
);

select results_eq(
  $$ select name, category, unit, price, quantity, low_stock_level, active from public.items
     where id = 'c0000000-0000-0000-0000-000000000001' $$,
  $$ values ('Paracetamol 500mg', 'Medicine', 'pack', 45000::bigint, 48, 10, true) $$,
  'the item is saved with tidy text and its opening quantity'
);
select results_eq(
  $$ select type, delta, quantity_before, quantity_after, created_by_name from public.stock_movements
     where item_id = 'c0000000-0000-0000-0000-000000000001' $$,
  $$ values ('opening', 48, 0, 48, 'Owner A') $$,
  'the opening quantity is recorded in the ledger'
);
select is(
  (select cost_price from public.item_costs where item_id = 'c0000000-0000-0000-0000-000000000001'),
  30000::bigint,
  'the cost price is stored separately'
);

select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000001', 'Paracetamol 500mg', 'Medicine', 'pack', 45000, 30000, 10, 48) $$,
  'saving the same new item twice (a double tap) does not fail'
);
select is(
  (select count(*)::int from public.stock_movements where item_id = 'c0000000-0000-0000-0000-000000000001'),
  1,
  '... and does not add the opening stock twice'
);

select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000001', 'Paracetamol', 'Medicine', 'pack', 50000, null, null, 999) $$,
  'the owner edits the item'
);
select results_eq(
  $$ select name, price, quantity, low_stock_level from public.items where id = 'c0000000-0000-0000-0000-000000000001' $$,
  $$ values ('Paracetamol', 50000::bigint, 48, 10) $$,
  'editing changes name and price, never quantity, and keeps the low-stock level when none is given'
);
select is(
  (select count(*)::int from public.item_costs where item_id = 'c0000000-0000-0000-0000-000000000001'),
  0,
  'clearing the cost price removes it'
);

select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000002', 'Water', null, '', 25000, 15000, null, 0) $$,
  'an item can start with no stock'
);
select results_eq(
  $$ select category, unit, quantity, low_stock_level from public.items where id = 'c0000000-0000-0000-0000-000000000002' $$,
  $$ values (null::text, null::text, 0, 5) $$,
  'a new item without a low-stock level gets the business default'
);
select is(
  (select count(*)::int from public.stock_movements where item_id = 'c0000000-0000-0000-0000-000000000002'),
  0,
  'no ledger entry for an opening quantity of zero'
);

select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'WATER', null, null, 1, null, null, 0) $$,
  'P0001', 'item_name_taken',
  'two items cannot share a name, whatever the letter case'
);
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Bad', null, null, -1, null, null, 0) $$,
  'P0001', 'validation', 'a negative price is refused'
);
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), '   ', null, null, 100, null, null, 0) $$,
  'P0001', 'validation', 'an item needs a name'
);
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Bad', null, null, 100, null, null, -5) $$,
  'P0001', 'validation', 'a negative opening quantity is refused'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Sneaky', null, null, 100, null, null, 0) $$,
  'P0001', 'permission_denied', 'staff cannot create items'
);
select throws_ok(
  $$ select public.archive_item('c0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'permission_denied', 'staff cannot archive items'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b1');
select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-00000000000b', 'Bread', 'Bakery', null, 80000, 50000, null, 20) $$,
  'owner B creates their own item'
);
select throws_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000001', 'Hijacked', null, null, 1, null, null, 0) $$,
  'P0001', 'conflict', 'owner B cannot edit business A''s item by guessing its id'
);
select throws_ok(
  $$ select public.archive_item('c0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'not_found', 'owner B cannot archive business A''s item'
);
select tests.clear_authentication();
select is(
  (select name from public.items where id = 'c0000000-0000-0000-0000-000000000001'),
  'Paracetamol',
  'business A''s item is untouched'
);

-- ---------------------------------------------------------------------------
-- Restocks
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');

select set_config(
  'tests.restock1',
  public.record_restock(
    'd0000000-0000-0000-0000-000000000001', current_date, ' MedSupply ', 'Invoice 42',
    '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":24,"unit_cost":28000},
      {"item_id":"c0000000-0000-0000-0000-000000000002","quantity":12}]'
  )::text,
  true
);
select ok(current_setting('tests.restock1') <> '', 'the owner records a delivery of two items');

select results_eq(
  $$ select name, quantity from public.items where business_id = 'b0000000-0000-0000-0000-00000000000a' order by name $$,
  $$ values ('Paracetamol', 72), ('Water', 12) $$,
  'each item''s stock goes up by what was received'
);
select results_eq(
  $$ select item_name, delta, quantity_before, quantity_after, supplier, unit_cost, restock_id::text
     from public.stock_movements where type = 'restock' order by item_name $$,
  $$ values ('Paracetamol', 24, 48, 72, 'MedSupply', 28000::bigint, current_setting('tests.restock1')),
            ('Water', 12, 0, 12, 'MedSupply', null::bigint, current_setting('tests.restock1')) $$,
  'each line is a ledger entry linked to the one delivery'
);
select results_eq(
  $$ select supplier, note, received_on, created_by_name from public.restocks $$,
  $$ values ('MedSupply', 'Invoice 42', current_date, 'Owner A') $$,
  'the delivery itself is recorded once'
);

select is(
  public.record_restock(
    'd0000000-0000-0000-0000-000000000001', current_date, 'MedSupply', 'Invoice 42',
    '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":24}]'
  )::text,
  current_setting('tests.restock1'),
  'saving the same delivery again returns the first one'
);
select is(
  (select quantity from public.items where id = 'c0000000-0000-0000-0000-000000000001'),
  72,
  '... and adds no stock twice'
);

select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
     '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":1},
       {"item_id":"c0000000-0000-0000-0000-000000000001","quantity":2}]') $$,
  'P0001', 'validation', 'an item can appear only once per delivery'
);
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
     '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":0}]') $$,
  'P0001', 'validation', 'a delivery line needs a quantity of at least 1'
);
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
     '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":2.5}]') $$,
  'P0001', 'validation', 'quantities are whole numbers'
);
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null, '[]') $$,
  'P0001', 'validation', 'a delivery needs at least one item'
);
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date + 2, null, null,
     '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":1}]') $$,
  'P0001', 'validation', 'a delivery cannot be dated in the future'
);
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
     '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":5},
       {"item_id":"c0000000-0000-0000-0000-00000000000b","quantity":5}]') $$,
  'P0001', 'not_found', 'a delivery cannot touch another business''s item'
);
select is(
  (select quantity from public.items where id = 'c0000000-0000-0000-0000-000000000001'),
  72,
  'a refused delivery changes nothing, not even its valid lines'
);
select is((select count(*)::int from public.restocks), 1, 'a refused delivery leaves no record');

select lives_ok($$ select public.archive_item('c0000000-0000-0000-0000-000000000002') $$, 'the owner archives an item');
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
     '[{"item_id":"c0000000-0000-0000-0000-000000000002","quantity":5}]') $$,
  'P0001', 'item_archived', 'an archived item cannot be restocked'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
     '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":5}]') $$,
  'P0001', 'permission_denied', 'staff cannot record deliveries'
);

-- ---------------------------------------------------------------------------
-- Who can read what
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select name, quantity, price from public.items $$,
  $$ values ('Paracetamol', 72, 50000::bigint) $$,
  'staff see items on sale with stock and price, but not archived items'
);
select is((select count(*)::int from public.item_costs), 0, 'staff cannot see cost prices');
select is((select count(*)::int from public.stock_movements), 0, 'staff cannot see the stock ledger');
select is((select count(*)::int from public.restocks), 0, 'staff cannot see deliveries');
select throws_ok(
  $$ update public.items set quantity = 1000 $$,
  '42501', null, 'staff cannot change stock directly'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.items), 2, 'the owner also sees archived items');
select is((select count(*)::int from public.item_costs), 1, 'the owner sees their cost prices');
select is((select count(*)::int from public.stock_movements), 3, 'the owner sees their whole ledger');
select throws_ok(
  $$ insert into public.stock_movements (business_id, item_id, item_name, type, delta, quantity_before,
       quantity_after, created_by_name, date_key)
     values ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'x',
       'restock', 1000, 72, 1072, 'x', current_date) $$,
  '42501', null, 'not even the owner can write to the ledger directly'
);
select throws_ok(
  $$ update public.items set quantity = 1000 $$,
  '42501', null, 'not even the owner can change stock directly'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b1');
select results_eq($$ select name from public.items $$, $$ values ('Bread') $$, 'owner B sees only business B''s items');
select is(
  (select count(*)::int from public.stock_movements where business_id = 'b0000000-0000-0000-0000-00000000000a'),
  0,
  'owner B sees nothing of business A''s ledger'
);
select is(
  (select count(*)::int from public.item_costs where business_id = 'b0000000-0000-0000-0000-00000000000a'),
  0,
  'owner B sees nothing of business A''s cost prices'
);

select tests.authenticate_as_anon();
select throws_ok($$ select * from public.items $$, '42501', null, 'a visitor cannot read items');

-- ---------------------------------------------------------------------------
-- Stock adjustments
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');

select is(
  public.adjust_stock('c0000000-0000-0000-0000-000000000001', null, 70, 72, 'damaged', ' Two boxes crushed '),
  70,
  'the owner sets stock to what was counted'
);
select results_eq(
  $$ select delta, quantity_before, quantity_after, reason, note from public.stock_movements
     where type = 'adjustment' $$,
  $$ values (-2, 72, 70, 'damaged', 'Two boxes crushed') $$,
  'the difference is a permanent ledger entry with the reason'
);
select throws_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000001', null, 65, 72, 'miscount', null) $$,
  'P0001', 'conflict', 'a count made before the stock changed is refused'
);
select throws_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000001', null, 70, 70, 'miscount', null) $$,
  'P0001', 'validation', 'an adjustment must change something'
);
select throws_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000001', null, 60, 70, 'other', '  ') $$,
  'P0001', 'validation', '"other" needs a note'
);
select throws_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000001', null, 60, 70, 'gift', null) $$,
  'P0001', 'validation', 'only the listed reasons are allowed'
);
select throws_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000001', null, -1, 70, 'miscount', null) $$,
  'P0001', 'validation', 'stock cannot be counted below zero'
);
select lives_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000002', null, 10, 12, 'lost_or_stolen', null) $$,
  'an archived item can still be counted'
);
select lives_ok($$ select public.restore_item('c0000000-0000-0000-0000-000000000002') $$, 'the owner restores an archived item');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000001', null, 1, 70, 'miscount', null) $$,
  'P0001', 'permission_denied', 'staff cannot adjust stock'
);
select is((select count(*)::int from public.items), 2, 'staff see the restored item again');

-- ---------------------------------------------------------------------------
-- The ledger is permanent
-- ---------------------------------------------------------------------------

select tests.clear_authentication();

select throws_ok(
  $$ update public.stock_movements set delta = 100 $$,
  'P0001', 'append_only', 'ledger entries cannot be changed, even by the database owner'
);
select throws_ok(
  $$ delete from public.stock_movements $$,
  'P0001', 'append_only', 'ledger entries cannot be deleted'
);
select throws_ok(
  $$ delete from public.restocks $$,
  'P0001', 'append_only', 'deliveries cannot be deleted'
);
select throws_ok(
  $$ delete from public.items where id = 'c0000000-0000-0000-0000-000000000002' $$,
  'P0001', 'append_only', 'items are archived, never deleted'
);

-- ---------------------------------------------------------------------------
-- The invariant: quantity equals the sum of the ledger, for every item
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select * from private.stock_mismatches('b0000000-0000-0000-0000-00000000000a') $$,
  'business A: every item''s quantity equals the sum of its ledger'
);
select is_empty(
  $$ select * from private.stock_mismatches('b0000000-0000-0000-0000-00000000000b') $$,
  'business B: every item''s quantity equals the sum of its ledger'
);

-- ---------------------------------------------------------------------------
-- A suspended business can do nothing
-- ---------------------------------------------------------------------------

update public.businesses set status = 'suspended' where id = 'b0000000-0000-0000-0000-00000000000a';

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
     '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":5}]') $$,
  'P0001', 'business_suspended', 'a suspended business cannot record deliveries'
);
select is((select count(*)::int from public.items), 0, 'a suspended business sees no items');

select * from finish();

rollback;
