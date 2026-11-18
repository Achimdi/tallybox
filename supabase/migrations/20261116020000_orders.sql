-- Orders, held orders and daily totals.
--
-- The rules (the same as web/src/domain/orders.ts and supplies.ts, checked by
-- the shared contract tests):
--   - An order is confirmed only when "Payment received" is ticked. There is no
--     payment gateway: the person confirming checks the money arrived.
--   - Names and prices come from the items now, never from the browser, and are
--     copied onto the order, so a later price change never rewrites a receipt.
--   - Stock is checked and taken in the same transaction: each item's own stock
--     (if it counts it) and every shared supply, all lines added up first.
--   - Each supply deduction is its own ledger entry, linked to the order and the
--     item. A void reverses that order's own entries, never today's settings.
--   - Confirming the same client_order_id twice returns the first order.
--   - A held order takes and reserves nothing; stock is checked on confirming.
--   - Rows are locked in one fixed order everywhere (items, then supplies, each
--     by id), so two orders or an order and a delivery cannot deadlock.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  order_number bigint not null check (order_number >= 1),
  -- Chosen by the app once per cart: a retry never makes a second order.
  client_order_id uuid not null,
  staff_id uuid references auth.users (id) on delete set null,
  staff_name text not null,
  -- Minor units.
  total bigint not null check (total >= 0),
  payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'card')),
  payment_reference text check (char_length(payment_reference) <= 60),
  payment_confirmed_by uuid references auth.users (id) on delete set null,
  payment_confirmed_by_name text not null,
  payment_confirmed_at timestamptz not null,
  customer_name text check (char_length(customer_name) <= 80),
  customer_phone text check (char_length(customer_phone) <= 30),
  note text check (char_length(note) <= 200),
  status text not null default 'completed' check (status in ('completed', 'voided')),
  -- The business's own day.
  date_key date not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  voided_by_name text,
  void_reason text check (char_length(void_reason) <= 200),
  unique (business_id, client_order_id),
  unique (business_id, order_number),
  unique (id, business_id),
  check ((status = 'voided') = (voided_at is not null and void_reason is not null))
);

create index orders_business_date_idx on public.orders (business_id, date_key desc, created_at desc);
create index orders_staff_date_idx on public.orders (business_id, staff_id, date_key);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  business_id uuid not null,
  item_id uuid not null,
  -- Snapshots, taken when the order was confirmed.
  name text not null,
  unit_price bigint not null check (unit_price >= 0),
  qty integer not null check (qty between 1 and 10000),
  line_total bigint not null check (line_total = unit_price * qty),
  line_no integer not null,
  foreign key (order_id, business_id) references public.orders (id, business_id),
  foreign key (item_id, business_id) references public.items (id, business_id),
  unique (order_id, item_id)
);

create index order_lines_order_idx on public.order_lines (order_id, line_no);

-- A cart saved while waiting for payment. Only items and quantities are kept:
-- prices and stock are checked when it is confirmed.
create table public.held_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  staff_id uuid references auth.users (id) on delete cascade,
  staff_name text not null,
  customer_name text check (char_length(customer_name) <= 80),
  customer_phone text check (char_length(customer_phone) <= 30),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create table public.held_order_lines (
  held_order_id uuid not null,
  business_id uuid not null,
  item_id uuid not null,
  qty integer not null check (qty between 1 and 10000),
  line_no integer not null,
  primary key (held_order_id, item_id),
  foreign key (held_order_id, business_id) references public.held_orders (id, business_id) on delete cascade,
  foreign key (item_id, business_id) references public.items (id, business_id)
);

-- One row per business day, kept up to date in the same transactions as orders
-- and voids, so the dashboard never adds up whole tables.
create table public.daily_summaries (
  business_id uuid not null references public.businesses (id) on delete restrict,
  date_key date not null,
  total_sales bigint not null default 0 check (total_sales >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  voided_count integer not null default 0 check (voided_count >= 0),
  voided_total bigint not null default 0 check (voided_total >= 0),
  -- {"cash": 0, "bank_transfer": 0, "card": 0}
  by_payment_method jsonb not null default '{"cash":0,"bank_transfer":0,"card":0}'::jsonb,
  primary key (business_id, date_key)
);

-- Stock movements now point at their order.
alter table public.stock_movements
  add constraint stock_movements_order_fk
    foreign key (order_id, business_id) references public.orders (id, business_id);

create index stock_movements_order_idx on public.stock_movements (order_id) where order_id is not null;

-- Orders are never deleted; only their status changes (by void_order).
create trigger orders_no_delete
  before delete on public.orders
  for each row execute function private.forbid_change();
create trigger order_lines_append_only
  before update or delete on public.order_lines
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only
-- ---------------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.held_orders enable row level security;
alter table public.held_order_lines enable row level security;
alter table public.daily_summaries enable row level security;

grant select on public.orders, public.order_lines, public.held_orders, public.held_order_lines,
  public.daily_summaries to authenticated;

-- Today in the signed-in user's own business. Read rules use it; it reveals
-- nothing about any other business.
create function private.my_today() returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.business_today(private.my_business_id())
$$;

grant execute on function private.my_today() to authenticated;

-- Owners read every order. Staff read only their own orders from today.
create policy "Owners read all orders; staff their own from today"
  on public.orders for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (
      (select private.my_role()) = 'owner'
      or (staff_id = (select auth.uid()) and date_key = (select private.my_today()))
    )
  );

-- A line is readable exactly when its order is (the orders policy applies inside).
create policy "Order lines follow their order"
  on public.order_lines for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and exists (select 1 from public.orders o where o.id = order_id)
  );

create policy "Owners read all holds; staff their own"
  on public.held_orders for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and ((select private.my_role()) = 'owner' or staff_id = (select auth.uid()))
  );

create policy "Held lines follow their hold"
  on public.held_order_lines for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and exists (select 1 from public.held_orders h where h.id = held_order_id)
  );

-- Staff never see sales totals.
create policy "Owners read daily totals"
  on public.daily_summaries for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (select private.my_role()) = 'owner'
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The signed-in member (owner or staff) of a business that may use Tallybox.
create function private.require_member(p_user_id uuid) returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_access text;
begin
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if not found then
    perform private.fail('permission_denied');
  end if;
  if not v_profile.active then
    perform private.fail('account_disabled');
  end if;
  v_access := private.business_access_state(v_profile.business_id);
  if v_access = 'suspended' then
    perform private.fail('business_suspended');
  end if;
  if v_access = 'ended' then
    perform private.fail('access_ended');
  end if;
  return v_profile;
end;
$$;

-- A cart from the browser, tidied: repeated items merged, empty lines dropped,
-- first-added order kept. Fails with 'validation' unless every quantity is a
-- whole number, each item at most 10,000, at most 100 items, at least one.
-- p_lines: [{"item_id": "...", "quantity": 2}, ...]
create function private.normalize_cart(p_lines jsonb)
returns table (item_id uuid, qty integer, line_no integer)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) > 200 then
    perform private.fail('validation');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) as e (line)
    where jsonb_typeof(e.line -> 'item_id') is distinct from 'string'
      or jsonb_typeof(e.line -> 'quantity') is distinct from 'number'
      or (e.line ->> 'quantity')::numeric <> trunc((e.line ->> 'quantity')::numeric)
      or (e.line ->> 'quantity')::numeric < 0
  ) then
    perform private.fail('validation');
  end if;

  return query
    with merged as (
      select
        (e.line ->> 'item_id')::uuid as id,
        sum((e.line ->> 'quantity')::numeric) as total,
        min(e.n) as first_seen
      from jsonb_array_elements(p_lines) with ordinality as e (line, n)
      group by 1
    )
    select m.id, m.total::integer, (row_number() over (order by m.first_seen))::integer
    from merged m
    where m.total > 0;

  -- Callers check the count; an empty or oversized cart is refused there.
exception
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.fail('validation');
end;
$$;

-- Adds a confirmed order (or takes away a voided one) from its day's totals.
create function private.add_to_daily_summary(
  p_business_id uuid,
  p_date_key date,
  p_payment_method text,
  p_total bigint,
  p_voided boolean
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.daily_summaries (business_id, date_key)
  values (p_business_id, p_date_key)
  on conflict (business_id, date_key) do nothing;

  if p_voided then
    update public.daily_summaries d
    set
      total_sales = d.total_sales - p_total,
      order_count = d.order_count - 1,
      voided_count = d.voided_count + 1,
      voided_total = d.voided_total + p_total,
      by_payment_method = jsonb_set(
        d.by_payment_method, array[p_payment_method],
        to_jsonb((d.by_payment_method ->> p_payment_method)::bigint - p_total)
      )
    where d.business_id = p_business_id and d.date_key = p_date_key;
  else
    update public.daily_summaries d
    set
      total_sales = d.total_sales + p_total,
      order_count = d.order_count + 1,
      by_payment_method = jsonb_set(
        d.by_payment_method, array[p_payment_method],
        to_jsonb((d.by_payment_method ->> p_payment_method)::bigint + p_total)
      )
    where d.business_id = p_business_id and d.date_key = p_date_key;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirming an order
-- ---------------------------------------------------------------------------

-- Confirms an order and takes its stock, all in one transaction. Returns the
-- order's id. Refusals: payment_not_confirmed, validation, item_unavailable,
-- insufficient_stock (the app re-reads stock to say which item or supply is short).
create function public.create_order(
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
  delete from pg_temp.cart;
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

-- ---------------------------------------------------------------------------
-- Voiding an order (owner only)
-- ---------------------------------------------------------------------------

-- Cancels a completed order: its stock goes back by reversing that order's own
-- sale entries (items and supplies alike), its day's totals go down, and the
-- order is kept, marked voided, with the reason.
create function public.void_order(p_order_id uuid, p_reason text) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid := private.require_owner(v_user_id);
  v_user_name text := private.display_name(v_user_id);
  v_today date := private.business_today(v_business_id);
  v_reason text := private.clean_text(p_reason);
  v_order public.orders%rowtype;
  v_sale record;
  v_before integer;
begin
  select * into v_order
  from public.orders o
  where o.id = p_order_id and o.business_id = v_business_id
  for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_reason is null or char_length(v_reason) > 200 then
    perform private.fail('validation');
  end if;
  if v_order.status <> 'completed' then
    perform private.fail('conflict');
  end if;

  -- Items first, then supplies, each by id: the same lock order as everywhere.
  for v_sale in
    select m.item_id, m.supply_id, m.item_name, m.source_item_id, m.source_item_name, m.delta
    from public.stock_movements m
    where m.order_id = v_order.id and m.type = 'sale'
    order by (m.item_id is null), coalesce(m.item_id, m.supply_id), m.created_at
  loop
    if v_sale.item_id is not null then
      update public.items i set quantity = i.quantity - v_sale.delta
      where i.id = v_sale.item_id
      returning i.quantity + v_sale.delta into v_before;
    else
      update public.supplies s set quantity = s.quantity - v_sale.delta
      where s.id = v_sale.supply_id
      returning s.quantity + v_sale.delta into v_before;
    end if;

    insert into public.stock_movements (
      business_id, item_id, supply_id, item_name, source_item_id, source_item_name, type, delta,
      quantity_before, quantity_after, order_id, created_by, created_by_name, date_key
    ) values (
      v_business_id, v_sale.item_id, v_sale.supply_id, v_sale.item_name, v_sale.source_item_id,
      v_sale.source_item_name, 'void', -v_sale.delta, v_before, v_before - v_sale.delta,
      v_order.id, v_user_id, v_user_name, v_today
    );
  end loop;

  perform private.add_to_daily_summary(
    v_business_id, v_order.date_key, v_order.payment_method, v_order.total, true
  );

  update public.orders
  set status = 'voided', voided_at = now(), voided_by = v_user_id, voided_by_name = v_user_name,
      void_reason = v_reason
  where id = v_order.id;
end;
$$;

-- Orders may change status (by void_order) but nothing else, ever.
create function private.only_void_changes_orders() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'completed' or new.status <> 'voided'
    or (to_jsonb(new) - array['status', 'voided_at', 'voided_by', 'voided_by_name', 'void_reason'])
      is distinct from
       (to_jsonb(old) - array['status', 'voided_at', 'voided_by', 'voided_by_name', 'void_reason']) then
    raise exception 'orders can only be voided' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger orders_only_void
  before update on public.orders
  for each row execute function private.only_void_changes_orders();

-- ---------------------------------------------------------------------------
-- Held orders
-- ---------------------------------------------------------------------------

-- Saves a cart while waiting for payment. Takes and reserves no stock.
-- p_held_order_id: the hold being edited (yours, or any if you are the owner);
-- null, or a hold you may not edit, saves a new one. Returns the hold's id.
create function public.save_held_order(
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
  delete from pg_temp.held_cart;
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

-- Removes a hold: staff their own, the owner any. Nothing else changes.
create function public.discard_held_order(p_held_order_id uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles := private.require_member(v_user_id);
begin
  delete from public.held_orders h
  where h.id = p_held_order_id
    and h.business_id = v_profile.business_id
    and (v_profile.role = 'owner' or h.staff_id = v_user_id);
  if not found then
    perform private.fail('not_found');
  end if;
end;
$$;

grant execute on function public.create_order(uuid, jsonb, text, text, boolean, text, text, text, uuid)
  to authenticated;
grant execute on function public.void_order(uuid, text) to authenticated;
grant execute on function public.save_held_order(uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.discard_held_order(uuid) to authenticated;
