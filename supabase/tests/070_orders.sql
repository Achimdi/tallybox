-- pgTAP: confirming orders (payment tick, prices from items, own stock and
-- shared supplies taken together, idempotency), voids that reverse an order's
-- own entries, held orders, daily totals, and who can read what.

begin;

select plan(58);

-- Business A: owner, two staff. Business B: owner.
select tests.create_user('owner-a@a.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a1');
select tests.create_user('staff1@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a2');
select tests.create_user('staff2@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a3');
select tests.create_user('owner-b@b.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.businesses (id, name, business_code, owner_id) values
  ('b0000000-0000-0000-0000-00000000000a', 'Drinks A', 'drinks-a', 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-00000000000b', 'Shop B', 'shop-b', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.profiles (id, business_id, role, username, display_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'owner', null, 'Owner A'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'ada', 'Ada'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'bola', 'Bola'),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'owner', null, 'Owner B');

-- The brief's drinks: Coke and Fanta use the shared bottle only; apple juice
-- counts its own 800 and uses the bottle too; jollof counts nothing.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select public.upsert_supply('d0000000-0000-0000-0000-000000000001', '300 ml bottle', 'bottle', null, 100, 1000);
select public.upsert_supply('d0000000-0000-0000-0000-000000000002', 'Bottle cap', 'cap', null, 100, 1000);
select public.upsert_item('c0000000-0000-0000-0000-000000000001', 'Coke', null, null, 50000, null, null, 0, false,
  '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1}]');
select public.upsert_item('c0000000-0000-0000-0000-000000000002', 'Fanta', null, null, 50000, null, null, 0, false,
  '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1}]');
select public.upsert_item('c0000000-0000-0000-0000-000000000003', 'Apple juice', null, null, 80000, null, null, 800, true,
  '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1}]');
select public.upsert_item('c0000000-0000-0000-0000-000000000004', 'Jollof rice', null, null, 250000, null, null, 0, false, '[]');
select public.upsert_item('c0000000-0000-0000-0000-000000000005', 'Old stock', null, null, 1000, null, null, 5, true, '[]');
select public.archive_item('c0000000-0000-0000-0000-000000000005');

-- ---------------------------------------------------------------------------
-- Confirming
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');

select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":1}]',
       'cash', null, false, null, null, null) $$,
  'P0001', 'payment_not_confirmed', 'an order is never confirmed before payment is ticked as received'
);
select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":1}]',
       'cash', null, null, null, null, null) $$,
  'P0001', 'payment_not_confirmed', 'a missing tick is not a tick'
);

-- 10 Coke + 10 apple juice + 10 Fanta use 30 bottles.
select set_config('tests.order1', public.create_order(
  'f0000000-0000-0000-0000-000000000001',
  '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":10},
    {"item_id":"c0000000-0000-0000-0000-000000000003","quantity":10},
    {"item_id":"c0000000-0000-0000-0000-000000000002","quantity":10}]',
  'cash', null, true, ' Chioma ', '0803 123 4567', null)::text, true);

select results_eq(
  $$ select order_number, staff_name, total, payment_method, payment_confirmed_by_name, customer_name, status
     from public.orders where id = current_setting('tests.order1')::uuid $$,
  $$ values (1::bigint, 'Ada', 1800000::bigint, 'cash', 'Ada', 'Chioma', 'completed') $$,
  'the order is saved with its number, total, who took it and who confirmed payment'
);
select results_eq(
  $$ select name, unit_price, qty, line_total from public.order_lines
     where order_id = current_setting('tests.order1')::uuid order by line_no $$,
  $$ values ('Coke', 50000::bigint, 10, 500000::bigint),
            ('Apple juice', 80000::bigint, 10, 800000::bigint),
            ('Fanta', 50000::bigint, 10, 500000::bigint) $$,
  'lines keep the cart order, with names and prices copied from the items'
);
select is(
  (select quantity from public.supplies where id = 'd0000000-0000-0000-0000-000000000001'),
  970,
  'every line''s bottles are added up and taken: 1,000 becomes 970'
);
select is(
  (select quantity from public.items where id = 'c0000000-0000-0000-0000-000000000003'),
  790,
  'apple juice also takes its own stock'
);
select is(
  (select quantity from public.supplies where id = 'd0000000-0000-0000-0000-000000000002'),
  1000,
  'a supply no item in the cart uses is untouched'
);

select tests.clear_authentication();
select results_eq(
  $$ select source_item_name, delta from public.stock_movements
     where order_id = current_setting('tests.order1')::uuid and supply_id is not null order by source_item_name $$,
  $$ values ('Apple juice', -10), ('Coke', -10), ('Fanta', -10) $$,
  'each supply deduction is its own ledger entry, linked to the order and the item'
);
select is(
  (select count(*)::int from public.stock_movements
   where order_id = current_setting('tests.order1')::uuid and item_id = 'c0000000-0000-0000-0000-000000000001'),
  0,
  'an item that does not count its own stock gets no entry of its own'
);
select results_eq(
  $$ select total_sales, order_count, by_payment_method ->> 'cash' from public.daily_summaries
     where business_id = 'b0000000-0000-0000-0000-00000000000a' $$,
  $$ values (1800000::bigint, 1, '1800000') $$,
  'the day''s totals go up in the same transaction'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select is(
  public.create_order(
    'f0000000-0000-0000-0000-000000000001',
    '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":99}]',
    'card', null, true, null, null, null),
  current_setting('tests.order1')::uuid,
  'sending the same order again returns the first one'
);
select is(
  (select quantity from public.supplies where id = 'd0000000-0000-0000-0000-000000000001'),
  970,
  'and takes no stock twice'
);

-- Refusals
select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000003","quantity":791}]',
       'cash', null, true, null, null, null) $$,
  'P0001', 'insufficient_stock', 'more than an item''s own stock is refused'
);
select throws_ok(
  $$ select public.create_order(gen_random_uuid(),
       '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":500},
         {"item_id":"c0000000-0000-0000-0000-000000000002","quantity":471}]',
       'cash', null, true, null, null, null) $$,
  'P0001', 'insufficient_stock', 'lines that each fit but together need more of a supply are refused'
);
select is(
  (select quantity from public.supplies where id = 'd0000000-0000-0000-0000-000000000001'),
  970,
  'a refused order takes nothing'
);
select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000005","quantity":1}]',
       'cash', null, true, null, null, null) $$,
  'P0001', 'item_unavailable', 'archived items cannot be sold'
);
select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-0000000000ff","quantity":1}]',
       'cash', null, true, null, null, null) $$,
  'P0001', 'item_unavailable', 'unknown items cannot be sold'
);
select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[]', 'cash', null, true, null, null, null) $$,
  'P0001', 'validation', 'an empty cart is refused'
);
select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000004","quantity":1.5}]',
       'cash', null, true, null, null, null) $$,
  'P0001', 'validation', 'fractions are refused'
);
select throws_ok(
  $$ select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000004","quantity":1}]',
       'bitcoin', null, true, null, null, null) $$,
  'P0001', 'validation', 'only cash, bank transfer and card machine are recorded'
);

-- Repeated lines merge; items that count nothing are never limited.
select set_config('tests.order2', public.create_order(
  gen_random_uuid(),
  '[{"item_id":"c0000000-0000-0000-0000-000000000004","quantity":2},
    {"item_id":"c0000000-0000-0000-0000-000000000004","quantity":3},
    {"item_id":"c0000000-0000-0000-0000-000000000001","quantity":0}]',
  'bank_transfer', ' TRF-991 ', true, null, null, ' extra pepper ')::text, true);
select results_eq(
  $$ select name, qty from public.order_lines where order_id = current_setting('tests.order2')::uuid $$,
  $$ values ('Jollof rice', 5) $$,
  'repeated items are merged and empty lines dropped'
);
select results_eq(
  $$ select order_number, payment_reference, note from public.orders where id = current_setting('tests.order2')::uuid $$,
  $$ values (2::bigint, 'TRF-991', 'extra pepper') $$,
  'each order gets the next number, with tidy text'
);

-- ---------------------------------------------------------------------------
-- Who can read orders
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select order_number from public.orders order by order_number $$,
  $$ values (1::bigint), (2::bigint) $$,
  'staff see their own orders from today'
);
select is((select count(*)::int from public.order_lines), 4, 'and their lines');
select is((select count(*)::int from public.daily_summaries), 0, 'staff never see sales totals');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.orders), 0, 'staff do not see other staff''s orders');
select is((select count(*)::int from public.order_lines), 0, 'nor their lines');

-- An order from yesterday is hidden from its own taker, not from the owner.
select tests.clear_authentication();
insert into public.orders (business_id, order_number, client_order_id, staff_id, staff_name, total,
  payment_method, payment_confirmed_by_name, payment_confirmed_at, date_key, created_at)
values ('b0000000-0000-0000-0000-00000000000a', 99, gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a2', 'Ada', 100,
  'cash', 'Ada', now() - interval '1 day', private.business_today('b0000000-0000-0000-0000-00000000000a') - 1, now() - interval '1 day');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.orders where order_number = 99), 0, 'staff do not see their orders from earlier days');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.orders), 3, 'the owner sees every order, any day');
select is((select total_sales from public.daily_summaries), 1800000 + 1250000::bigint, 'the owner sees the day''s totals');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.orders), 0, 'another business sees none of these orders');
select throws_ok(
  $$ select public.void_order(current_setting('tests.order1')::uuid, 'Spite') $$,
  'P0001', 'not_found', 'another business cannot void them'
);

-- Nobody writes to orders directly.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ update public.orders set total = 1 $$,
  '42501', null, 'nobody changes an order from the browser'
);

-- ---------------------------------------------------------------------------
-- Voiding
-- ---------------------------------------------------------------------------

-- First, the owner changes what Coke uses: two bottles and a cap.
select public.upsert_item('c0000000-0000-0000-0000-000000000001', 'Coke', null, null, 50000, null, null, 0, false,
  '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":2},
    {"supply_id":"d0000000-0000-0000-0000-000000000002","units_per_sale":1}]');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.void_order(current_setting('tests.order1')::uuid, 'Mistake') $$,
  'P0001', 'permission_denied', 'staff cannot void'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select public.void_order(current_setting('tests.order1')::uuid, '   ') $$,
  'P0001', 'validation', 'a void needs a reason'
);
select lives_ok(
  $$ select public.void_order(current_setting('tests.order1')::uuid, ' Customer returned it ') $$,
  'the owner voids an order'
);
select results_eq(
  $$ select status, voided_by_name, void_reason from public.orders where id = current_setting('tests.order1')::uuid $$,
  $$ values ('voided', 'Owner A', 'Customer returned it') $$,
  'the order is kept, marked voided, with who and why'
);
select is(
  (select quantity from public.supplies where id = 'd0000000-0000-0000-0000-000000000001'),
  1000,
  'exactly the 30 bottles that order took come back, whatever Coke uses now'
);
select is(
  (select quantity from public.supplies where id = 'd0000000-0000-0000-0000-000000000002'),
  1000,
  'caps the order never used are untouched'
);
select is(
  (select quantity from public.items where id = 'c0000000-0000-0000-0000-000000000003'),
  800,
  'apple juice''s own stock comes back too'
);
select results_eq(
  $$ select total_sales, order_count, voided_count, voided_total, (by_payment_method ->> 'cash')::bigint
     from public.daily_summaries $$,
  $$ values (1250000::bigint, 1, 1, 1800000::bigint, 0::bigint) $$,
  'the day''s totals drop the voided order and count it apart'
);
select throws_ok(
  $$ select public.void_order(current_setting('tests.order1')::uuid, 'Again') $$,
  'P0001', 'conflict', 'an order is voided only once'
);
select throws_ok(
  $$ select public.void_order(gen_random_uuid(), 'Ghost') $$,
  'P0001', 'not_found', 'an unknown order cannot be voided'
);

-- New sales use the new amounts.
select public.create_order(gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":3}]',
  'cash', null, true, null, null, null);
select results_eq(
  $$ select quantity from public.supplies order by id $$,
  $$ values (994), (997) $$,
  'a new sale of Coke uses two bottles and a cap each'
);

-- ---------------------------------------------------------------------------
-- Held orders
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select set_config('tests.held', public.save_held_order(
  null, '[{"item_id":"c0000000-0000-0000-0000-000000000003","quantity":4}]', 'Mrs Bello', null, 'Paying by transfer'
)::text, true);
select is(
  (select quantity from public.items where id = 'c0000000-0000-0000-0000-000000000003'),
  800,
  'a held order takes no stock'
);
select results_eq(
  $$ select h.staff_name, h.customer_name, l.qty from public.held_orders h
     join public.held_order_lines l on l.held_order_id = h.id $$,
  $$ values ('Ada', 'Mrs Bello', 4) $$,
  'the hold keeps who held it, the customer and quantities only'
);
select lives_ok(
  $$ select public.save_held_order(current_setting('tests.held')::uuid,
       '[{"item_id":"c0000000-0000-0000-0000-000000000003","quantity":6}]', 'Mrs Bello', null, null) $$,
  'staff can edit their own hold'
);
select is((select qty from public.held_order_lines), 6, 'the edit replaces the lines');
select throws_ok(
  $$ select public.save_held_order(null, '[]', null, null, null) $$,
  'P0001', 'validation', 'an empty hold is refused'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.held_orders), 0, 'staff do not see another person''s holds');
select throws_ok(
  $$ select public.discard_held_order(current_setting('tests.held')::uuid) $$,
  'P0001', 'not_found', 'nor discard them'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select set_config('tests.order3', public.create_order(
  gen_random_uuid(), '[{"item_id":"c0000000-0000-0000-0000-000000000003","quantity":6}]',
  'card', null, true, 'Mrs Bello', null, null, current_setting('tests.held')::uuid)::text, true);
select is((select count(*)::int from public.held_orders), 0, 'confirming a hold removes it in the same step');
select is(
  (select quantity from public.items where id = 'c0000000-0000-0000-0000-000000000003'),
  794,
  'and stock is taken only then'
);

select public.save_held_order(null, '[{"item_id":"c0000000-0000-0000-0000-000000000004","quantity":1}]', null, null, null);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.held_orders), 1, 'the owner sees everyone''s holds');
select lives_ok(
  $$ select public.discard_held_order((select id from public.held_orders limit 1)) $$,
  'and can discard any of them'
);

-- ---------------------------------------------------------------------------
-- The ledger stays true; orders can't be rewritten
-- ---------------------------------------------------------------------------

select tests.clear_authentication();
select is_empty(
  $$ select * from private.stock_mismatches('b0000000-0000-0000-0000-00000000000a') $$,
  'every item and supply quantity still equals the sum of its ledger'
);
select throws_ok(
  $$ update public.orders set total = 1 where id = current_setting('tests.order3')::uuid $$,
  'P0001', 'orders can only be voided', 'even the database owner cannot rewrite an order'
);
select throws_ok(
  $$ delete from public.order_lines where order_id = current_setting('tests.order3')::uuid $$,
  'P0001', null, 'or remove its lines'
);

select * from finish();

rollback;
