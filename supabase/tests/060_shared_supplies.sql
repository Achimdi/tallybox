-- pgTAP: shared supplies. Supplies with their own ledger, items that count
-- their own stock, supplies, both or neither, a record of every change to how
-- an item counts stock, restock and adjust for supplies, and who can read what.
-- Sales and voids that use supplies are tested with orders (Phase 2C).

begin;

select plan(49);

-- Two businesses: A (owner, staff) and B (owner).
select tests.create_user('owner-a@a.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a1');
select tests.create_user('staff-a@a.test', '{"role":"staff","business_id":"b0000000-0000-0000-0000-00000000000a"}', 'aaaaaaaa-0000-0000-0000-0000000000a2');
select tests.create_user('owner-b@b.test', '{"role":"owner","business_id":"b0000000-0000-0000-0000-00000000000b"}', 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.businesses (id, name, business_code, owner_id, default_low_stock_level) values
  ('b0000000-0000-0000-0000-00000000000a', 'Drinks A', 'drinks-a', 'aaaaaaaa-0000-0000-0000-0000000000a1', 50),
  ('b0000000-0000-0000-0000-00000000000b', 'Shop B', 'shop-b', 'aaaaaaaa-0000-0000-0000-0000000000b1', 3);

insert into public.profiles (id, business_id, role, username, display_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'owner', null, 'Owner A'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', 'staff', 'staff1', 'Staff A'),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'owner', null, 'Owner B');

-- Ids, chosen by "the app"
--   d...01 300 ml bottle (A)   d...02 Bottle cap (A)   d...0b Crate (B)
--   c...01 Coke (A, supplies only)   c...02 Apple juice (A, both)   c...03 Jollof (A, neither)

-- ---------------------------------------------------------------------------
-- Supplies
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a1');

select is(
  public.upsert_supply('d0000000-0000-0000-0000-000000000001', '  300 ml   bottle ', 'bottle', 6000, 100, 1000),
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'the owner creates a supply'
);
select results_eq(
  $$ select name, unit, quantity, low_stock_level, active from public.supplies
     where id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ values ('300 ml bottle', 'bottle', 1000, 100, true) $$,
  'the supply is saved with tidy text and its opening count'
);
select results_eq(
  $$ select type, delta, quantity_before, quantity_after, item_id, item_name from public.stock_movements
     where supply_id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ values ('opening', 1000, 0, 1000, null::uuid, '300 ml bottle') $$,
  'the opening count is a supply entry in the ledger'
);
select is(
  (select cost_price from public.supply_costs where supply_id = 'd0000000-0000-0000-0000-000000000001'),
  6000::bigint,
  'the supply cost is stored separately'
);

select public.upsert_supply('d0000000-0000-0000-0000-000000000002', 'Bottle cap', 'cap', null, null, 1000);
select is(
  (select low_stock_level from public.supplies where id = 'd0000000-0000-0000-0000-000000000002'),
  50,
  'a new supply without a low-stock level gets the business default'
);

select lives_ok(
  $$ select public.upsert_supply('d0000000-0000-0000-0000-000000000001', '300 ml bottle', 'bottle', 6500, 100, 1000) $$,
  'saving the same supply twice does not fail'
);
select is(
  (select count(*)::int from public.stock_movements where supply_id = 'd0000000-0000-0000-0000-000000000001'),
  1,
  'and never adds its opening count twice'
);
select throws_ok(
  $$ select public.upsert_supply(gen_random_uuid(), '300 ML BOTTLE', null, null, null, 0) $$,
  'P0001', 'supply_name_taken', 'two supplies cannot share a name, whatever the letter case'
);
select throws_ok(
  $$ select public.upsert_supply(gen_random_uuid(), '   ', null, null, null, 0) $$,
  'P0001', 'validation', 'a supply needs a name'
);
select throws_ok(
  $$ select public.upsert_supply(gen_random_uuid(), 'Straw', null, null, null, -5) $$,
  'P0001', 'validation', 'an opening count cannot be negative'
);

-- ---------------------------------------------------------------------------
-- How items count stock
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000001', 'Coke 300ml', 'Drinks', null, 50000, null, null, 0, false,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1},
         {"supply_id":"d0000000-0000-0000-0000-000000000002","units_per_sale":1}]') $$,
  'an item can use shared supplies only'
);
select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000002', 'Apple juice', 'Drinks', null, 80000, 35000, null, 800, true,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1}]') $$,
  'an item can count its own stock and use a supply'
);
select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000003', 'Jollof rice', 'Food', null, 250000, null, null, 0, false, '[]') $$,
  'an item can count nothing (food made to order)'
);

select results_eq(
  $$ select name, tracks_own_stock, quantity from public.items order by name $$,
  $$ values ('Apple juice', true, 800), ('Coke 300ml', false, 0), ('Jollof rice', false, 0) $$,
  'each item keeps how it counts stock; only the item counting its own stock has a quantity'
);
select results_eq(
  $$ select i.name, s.name, u.units_per_sale
     from public.item_supplies u
     join public.items i on i.id = u.item_id
     join public.supplies s on s.id = u.supply_id
     order by i.name, s.name $$,
  $$ values ('Apple juice', '300 ml bottle', 1), ('Coke 300ml', '300 ml bottle', 1), ('Coke 300ml', 'Bottle cap', 1) $$,
  'which supplies each item uses, and how many per sale'
);
select results_eq(
  $$ select quantity from public.supplies order by name $$,
  $$ values (1000), (1000) $$,
  'creating items deducts nothing from supplies'
);
select is(
  (select count(*)::int from public.stock_mode_changes),
  0,
  'creating items records no change of mode'
);

-- Bad settings
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Fanta', null, null, 50000, null, null, 0, false,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":0}]') $$,
  'P0001', 'validation', 'a supply must be used at least once per sale'
);
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Fanta', null, null, 50000, null, null, 0, false,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1},
         {"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":2}]') $$,
  'P0001', 'validation', 'each supply is listed once'
);
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Fanta', null, null, 50000, null, null, 0, false,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1.5}]') $$,
  'P0001', 'validation', 'units per sale are whole numbers'
);
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Fanta', null, null, 50000, null, null, 5, false, '[]') $$,
  'P0001', 'validation', 'an opening count needs the item to count its own stock'
);
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Fanta', null, null, 50000, null, null, 0, false, '{"supply_id":"x"}') $$,
  'P0001', 'validation', 'supplies must be a list'
);

-- Changing how an item counts stock is recorded, and applies to new sales only.
select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000002', 'Apple juice', 'Drinks', null, 80000, 35000, null, 0, true,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":1}]') $$,
  'saving an item without changing its mode'
);
select is((select count(*)::int from public.stock_mode_changes), 0, 'records nothing');

select lives_ok(
  $$ select public.upsert_item('c0000000-0000-0000-0000-000000000002', 'Apple juice', 'Drinks', null, 80000, 35000, null, 0, false,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000001","units_per_sale":2},
         {"supply_id":"d0000000-0000-0000-0000-000000000002","units_per_sale":1}]') $$,
  'the owner changes how apple juice counts stock'
);
select results_eq(
  $$ select changed_by_name, before ->> 'tracks_own_stock', jsonb_array_length(before -> 'supplies'),
            after ->> 'tracks_own_stock', jsonb_array_length(after -> 'supplies')
     from public.stock_mode_changes where item_id = 'c0000000-0000-0000-0000-000000000002' $$,
  $$ values ('Owner A', 'true', 1, 'false', 2) $$,
  'the change is recorded with who made it, before and after'
);
select is(
  (select quantity from public.items where id = 'c0000000-0000-0000-0000-000000000002'),
  800,
  'turning off its own count keeps its last quantity, untouched'
);

-- ---------------------------------------------------------------------------
-- Restock and adjust supplies
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.record_restock('e0000000-0000-0000-0000-000000000001', current_date, 'Glassworks', null,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000001","quantity":500,"unit_cost":5500}]') $$,
  'a delivery can bring supplies'
);
select is(
  (select quantity from public.supplies where id = 'd0000000-0000-0000-0000-000000000001'),
  1500,
  'the supply goes up by what arrived'
);
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
       '[{"item_id":"c0000000-0000-0000-0000-000000000001","quantity":5}]') $$,
  'P0001', 'stock_not_counted', 'an item that does not count its own stock is restocked through its supplies'
);
select throws_ok(
  $$ select public.record_restock(gen_random_uuid(), current_date, null, null,
       '[{"item_id":"c0000000-0000-0000-0000-000000000003","supply_id":"d0000000-0000-0000-0000-000000000001","quantity":5}]') $$,
  'P0001', 'validation', 'a delivery line names an item or a supply, not both'
);

select is(
  public.adjust_stock(null, 'd0000000-0000-0000-0000-000000000001', 1490, 1500, 'damaged', 'Broken in the store'),
  1490,
  'the owner adjusts a supply to what was counted'
);
select throws_ok(
  $$ select public.adjust_stock(null, 'd0000000-0000-0000-0000-000000000001', 1, 1500, 'miscount', null) $$,
  'P0001', 'conflict', 'a count made against an old number is refused'
);
select throws_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000001', null, 5, 0, 'miscount', null) $$,
  'P0001', 'stock_not_counted', 'an item that does not count its own stock cannot be adjusted'
);
select throws_ok(
  $$ select public.adjust_stock('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 5, 0, 'miscount', null) $$,
  'P0001', 'validation', 'an adjustment names an item or a supply, not both'
);

-- ---------------------------------------------------------------------------
-- Archiving
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.archive_supply('d0000000-0000-0000-0000-000000000002') $$,
  'P0001', 'supply_in_use', 'a supply that items on sale use cannot be archived'
);
select public.archive_item('c0000000-0000-0000-0000-000000000001');
select public.upsert_item('c0000000-0000-0000-0000-000000000002', 'Apple juice', 'Drinks', null, 80000, 35000, null, 0, true, '[]');
select lives_ok(
  $$ select public.archive_supply('d0000000-0000-0000-0000-000000000002') $$,
  'once no item on sale uses it, it can be archived'
);
select throws_ok(
  $$ select public.upsert_item(gen_random_uuid(), 'Fanta', null, null, 50000, null, null, 0, false,
       '[{"supply_id":"d0000000-0000-0000-0000-000000000002","units_per_sale":1}]') $$,
  'P0001', 'item_archived', 'an archived supply cannot be chosen on an item'
);
select is(
  public.adjust_stock(null, 'd0000000-0000-0000-0000-000000000002', 0, 1000, 'expired', null),
  0,
  'archived stock can still be counted down to zero'
);

-- ---------------------------------------------------------------------------
-- Who can read and do what
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000a2');
select results_eq(
  $$ select name from public.supplies $$,
  $$ values ('300 ml bottle') $$,
  'staff see the supplies in use (to know what can be sold), not archived ones'
);
select is((select count(*)::int from public.supply_costs), 0, 'staff never see supply costs');
select is((select count(*)::int from public.stock_mode_changes), 0, 'staff do not see the record of mode changes');
select throws_ok(
  $$ select public.upsert_supply(gen_random_uuid(), 'Straw', null, null, null, 0) $$,
  'P0001', 'permission_denied', 'staff cannot create supplies'
);
select throws_ok(
  $$ insert into public.supplies (business_id, name) values ('b0000000-0000-0000-0000-00000000000a', 'Sneaky') $$,
  '42501', null, 'nobody writes to supplies directly from the browser'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.supplies), 0, 'another business sees none of these supplies');
select is((select count(*)::int from public.item_supplies), 0, 'nor which items use them');
select throws_ok(
  $$ select public.adjust_stock(null, 'd0000000-0000-0000-0000-000000000001', 0, 1490, 'miscount', null) $$,
  'P0001', 'not_found', 'another business cannot adjust them'
);

-- ---------------------------------------------------------------------------
-- The ledger stays true
-- ---------------------------------------------------------------------------

select tests.clear_authentication();
select is_empty(
  $$ select * from private.stock_mismatches('b0000000-0000-0000-0000-00000000000a') $$,
  'every item and supply quantity equals the sum of its ledger'
);
select throws_ok(
  $$ update public.stock_mode_changes set changed_by_name = 'Someone else' $$,
  'P0001', null, 'the record of mode changes can never be edited'
);

select * from finish();

rollback;
