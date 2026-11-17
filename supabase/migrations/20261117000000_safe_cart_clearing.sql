-- Hosted Supabase refuses DELETE and UPDATE without a WHERE clause (the
-- safeupdate guard on API requests), and that applies inside functions too.
-- create_order and save_held_order cleared their temporary cart with a bare
-- DELETE, so every order and every hold failed on the hosted project while
-- passing locally. Same functions, with "where true" on that one line.
--
-- CREATE OR REPLACE keeps the existing grants.

create or replace function public.create_order(
  p_client_order_id uuid,
  p_lines jsonb,
  p_payment_method text,
  p_payment_reference text,
  p_payment_confirmed boolean,
  p_customer_name text,
  p_customer_phone text,
  p_note text,
  p_held_order_id uuid default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles := private.require_member(v_user_id);
  v_business_id uuid := v_profile.business_id;
  v_user_name text := v_profile.display_name;
  v_today date := private.business_today(v_business_id);
  v_reference text := private.clean_text(p_payment_reference);
  v_customer_name text := private.clean_text(p_customer_name);
  v_customer_phone text := private.clean_text(p_customer_phone);
  v_note text := private.clean_text(p_note);
  v_order_id uuid;
  v_order_number bigint;
  v_total bigint;
  v_line_count integer;
  v_row record;
  v_constraint text;
begin
  if p_client_order_id is null then
    perform private.fail('validation');
  end if;

  -- Already confirmed: a retry or a double tap. Return the same order.
  select o.id into v_order_id
  from public.orders o
  where o.business_id = v_business_id and o.client_order_id = p_client_order_id;
  if found then
    return v_order_id;
  end if;

  if p_payment_confirmed is distinct from true then
    perform private.fail('payment_not_confirmed');
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'bank_transfer', 'card')
    or char_length(coalesce(v_reference, '')) > 60
    or char_length(coalesce(v_customer_name, '')) > 80
    or char_length(coalesce(v_customer_phone, '')) > 30
    or char_length(coalesce(v_note, '')) > 200 then
    perform private.fail('validation');
  end if;

  create temporary table if not exists pg_temp.cart (
    item_id uuid primary key, qty integer not null, line_no integer not null
  ) on commit drop;
  delete from pg_temp.cart where true;
  insert into pg_temp.cart select * from private.normalize_cart(p_lines);

  select count(*) into v_line_count from pg_temp.cart;
  if v_line_count = 0 or v_line_count > 100
    or exists (select 1 from pg_temp.cart c where c.qty > 10000) then
    perform private.fail('validation');
  end if;

  -- Lock the items, in id order, then check every one is on sale here.
  perform 1
  from public.items i
  join pg_temp.cart c on c.item_id = i.id
  where i.business_id = v_business_id
  order by i.id
  for update of i;

  if exists (
    select 1 from pg_temp.cart c
    left join public.items i on i.id = c.item_id and i.business_id = v_business_id
    where i.id is null or not i.active
  ) then
    perform private.fail('item_unavailable');
  end if;

  -- Own stock, for items that count it.
  if exists (
    select 1 from pg_temp.cart c
    join public.items i on i.id = c.item_id
    where i.tracks_own_stock and c.qty > i.quantity
  ) then
    perform private.fail('insufficient_stock');
  end if;

  -- Shared supplies: lock them in id order, then check what all lines need together.
  perform 1
  from public.supplies s
  where s.id in (
    select u.supply_id from public.item_supplies u join pg_temp.cart c on c.item_id = u.item_id
  )
  order by s.id
  for update of s;

  if exists (
    select 1
    from (
      select u.supply_id, sum(c.qty * u.units_per_sale) as needed
      from pg_temp.cart c
      join public.item_supplies u on u.item_id = c.item_id
      group by u.supply_id
    ) n
    join public.supplies s on s.id = n.supply_id
    where not s.active or n.needed > s.quantity
  ) then
    perform private.fail('insufficient_stock');
  end if;

  -- The next order number for this business.
  update public.businesses b
  set order_counter = b.order_counter + 1
  where b.id = v_business_id
  returning b.order_counter into v_order_number;

  select sum(i.price * c.qty) into v_total
  from pg_temp.cart c join public.items i on i.id = c.item_id;

  insert into public.orders (
    business_id, order_number, client_order_id, staff_id, staff_name, total,
    payment_method, payment_reference, payment_confirmed_by, payment_confirmed_by_name,
    payment_confirmed_at, customer_name, customer_phone, note, date_key
  ) values (
    v_business_id, v_order_number, p_client_order_id, v_user_id, v_user_name, v_total,
    p_payment_method, v_reference, v_user_id, v_user_name,
    now(), v_customer_name, v_customer_phone, v_note, v_today
  )
  returning id into v_order_id;

  -- Lines: names and prices are snapshots of the items now.
  insert into public.order_lines (order_id, business_id, item_id, name, unit_price, qty, line_total, line_no)
  select v_order_id, v_business_id, i.id, i.name, i.price, c.qty, i.price * c.qty, c.line_no
  from pg_temp.cart c join public.items i on i.id = c.item_id;

  -- Own stock goes down, one ledger entry per line, items in id order.
  for v_row in
    select i.id, i.name, i.quantity, c.qty
    from pg_temp.cart c join public.items i on i.id = c.item_id
    where i.tracks_own_stock
    order by i.id
  loop
    update public.items set quantity = quantity - v_row.qty where id = v_row.id;
    insert into public.stock_movements (
      business_id, item_id, item_name, type, delta, quantity_before, quantity_after,
      order_id, created_by, created_by_name, date_key
    ) values (
      v_business_id, v_row.id, v_row.name, 'sale', -v_row.qty, v_row.quantity, v_row.quantity - v_row.qty,
      v_order_id, v_user_id, v_user_name, v_today
    );
  end loop;

  -- Each supply deduction is its own entry, linked to the item that used it.
  for v_row in
    select s.id as supply_id, s.name as supply_name, i.id as item_id, i.name as item_name,
           c.qty * u.units_per_sale as used
    from pg_temp.cart c
    join public.items i on i.id = c.item_id
    join public.item_supplies u on u.item_id = c.item_id
    join public.supplies s on s.id = u.supply_id
    order by c.line_no, s.id
  loop
    insert into public.stock_movements (
      business_id, supply_id, item_name, source_item_id, source_item_name, type, delta,
      quantity_before, quantity_after, order_id, created_by, created_by_name, date_key
    )
    select
      v_business_id, s.id, v_row.supply_name, v_row.item_id, v_row.item_name, 'sale', -v_row.used,
      s.quantity, s.quantity - v_row.used, v_order_id, v_user_id, v_user_name, v_today
    from public.supplies s where s.id = v_row.supply_id;
    update public.supplies set quantity = quantity - v_row.used where id = v_row.supply_id;
  end loop;

  perform private.add_to_daily_summary(v_business_id, v_today, p_payment_method, v_total, false);

  -- A confirmed hold is removed in the same step (staff: only their own).
  if p_held_order_id is not null then
    delete from public.held_orders h
    where h.id = p_held_order_id
      and h.business_id = v_business_id
      and (v_profile.role = 'owner' or h.staff_id = v_user_id);
  end if;

  return v_order_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'orders_business_id_client_order_id_key' then
      -- The same order arrived a moment earlier in another request.
      return (
        select o.id from public.orders o
        where o.business_id = v_business_id and o.client_order_id = p_client_order_id
      );
    end if;
    raise;
end;
$$;

create or replace function public.save_held_order(
  p_held_order_id uuid,
  p_lines jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_note text
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles := private.require_member(v_user_id);
  v_business_id uuid := v_profile.business_id;
  v_customer_name text := private.clean_text(p_customer_name);
  v_customer_phone text := private.clean_text(p_customer_phone);
  v_note text := private.clean_text(p_note);
  v_held_id uuid;
  v_line_count integer;
begin
  if char_length(coalesce(v_customer_name, '')) > 80
    or char_length(coalesce(v_customer_phone, '')) > 30
    or char_length(coalesce(v_note, '')) > 200 then
    perform private.fail('validation');
  end if;

  create temporary table if not exists pg_temp.held_cart (
    item_id uuid primary key, qty integer not null, line_no integer not null
  ) on commit drop;
  delete from pg_temp.held_cart where true;
  insert into pg_temp.held_cart select * from private.normalize_cart(p_lines);

  select count(*) into v_line_count from pg_temp.held_cart;
  if v_line_count = 0 or v_line_count > 100
    or exists (select 1 from pg_temp.held_cart c where c.qty > 10000) then
    perform private.fail('validation');
  end if;
  if exists (
    select 1 from pg_temp.held_cart c
    left join public.items i on i.id = c.item_id and i.business_id = v_business_id
    where i.id is null or not i.active
  ) then
    perform private.fail('item_unavailable');
  end if;

  select h.id into v_held_id
  from public.held_orders h
  where h.id = p_held_order_id
    and h.business_id = v_business_id
    and (v_profile.role = 'owner' or h.staff_id = v_user_id)
  for update;

  if v_held_id is not null then
    update public.held_orders
    set customer_name = v_customer_name, customer_phone = v_customer_phone, note = v_note,
        updated_at = now()
    where id = v_held_id;
    delete from public.held_order_lines where held_order_id = v_held_id;
  else
    insert into public.held_orders (business_id, staff_id, staff_name, customer_name, customer_phone, note)
    values (v_business_id, v_user_id, v_profile.display_name, v_customer_name, v_customer_phone, v_note)
    returning id into v_held_id;
  end if;

  insert into public.held_order_lines (held_order_id, business_id, item_id, qty, line_no)
  select v_held_id, v_business_id, c.item_id, c.qty, c.line_no from pg_temp.held_cart c;

  return v_held_id;
end;
$$;
