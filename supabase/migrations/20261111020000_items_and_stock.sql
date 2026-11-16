-- Phase 2: items, cost prices, restocks, stock adjustments and the stock ledger.
--
-- The one rule that matters most here: an item's quantity only ever changes
-- together with a row in stock_movements, inside the same function and the
-- same transaction. So the quantity always equals the sum of its movements,
-- and the ledger is a complete, permanent history. Movements can never be
-- edited or deleted, by anyone.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Today's date in the business's own timezone (its "day").
create function private.business_today(p_business_id uuid) returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone b.timezone)::date
  from public.businesses b
  where b.id = p_business_id
$$;

-- The name to record against a change, kept as a snapshot.
create function private.display_name(p_user_id uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.display_name from public.profiles p where p.id = p_user_id), 'Unknown')
$$;

-- Trims and collapses inner spaces. Blank becomes null.
create function private.clean_text(p_value text) returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g'), '')
$$;

-- Stops any change. Used to make history tables append-only.
create function private.forbid_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only' using errcode = 'P0001';
end;
$$;

create function private.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  name_lower text generated always as (lower(name)) stored,
  category text check (char_length(category) between 1 and 40),
  unit text check (char_length(unit) between 1 and 20),
  -- Selling price in minor units (kobo, cents).
  price bigint not null check (price between 0 and 1000000000000),
  -- Whole units on hand. Changed only by the functions below.
  quantity integer not null default 0 check (quantity >= 0),
  low_stock_level integer not null default 0 check (low_stock_level between 0 and 1000000),
  -- false = archived. Items are never deleted, so old orders and history keep their item.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One name per business, ignoring letter case (archived items included).
  unique (business_id, name_lower),
  -- Lets other tables prove their row belongs to the same business as the item.
  unique (id, business_id)
);

comment on table public.items is 'What a business sells. Quantity always equals the sum of its stock movements.';

-- Kept apart from items so that only the owner can ever read cost prices.
create table public.item_costs (
  item_id uuid primary key,
  business_id uuid not null,
  cost_price bigint not null check (cost_price between 0 and 1000000000000),
  updated_at timestamptz not null default now(),
  foreign key (item_id, business_id) references public.items (id, business_id) on delete cascade
);

-- One delivery from a supplier. Its lines are the 'restock' stock movements.
create table public.restocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  -- Chosen by the app for each delivery form, so a retry or a double tap saves it only once.
  client_id uuid not null,
  supplier text check (char_length(supplier) <= 80),
  note text check (char_length(note) <= 200),
  received_on date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, client_id),
  unique (id, business_id)
);

-- The stock ledger. Append-only.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  item_id uuid not null,
  -- Snapshot, so renaming an item never rewrites history.
  item_name text not null,
  type text not null check (type in ('opening', 'sale', 'void', 'restock', 'adjustment')),
  delta integer not null check (delta <> 0),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  -- Adjustments only.
  reason text check (reason in ('damaged', 'expired', 'lost_or_stolen', 'miscount', 'other')),
  note text check (char_length(note) <= 200),
  -- Sales and voids (Phase 3 adds the link to orders).
  order_id uuid,
  -- Restocks only.
  restock_id uuid,
  supplier text check (char_length(supplier) <= 80),
  unit_cost bigint check (unit_cost between 0 and 1000000000000),
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text not null,
  -- The business's own day, for filtering by date.
  date_key date not null,
  created_at timestamptz not null default now(),
  foreign key (item_id, business_id) references public.items (id, business_id),
  foreign key (restock_id, business_id) references public.restocks (id, business_id),
  check (quantity_after = quantity_before + delta),
  check ((type = 'adjustment') = (reason is not null)),
  check ((type = 'restock') = (restock_id is not null))
);

comment on table public.stock_movements is
  'Every change to every item''s quantity. Append-only: rows can never be changed or deleted.';

create index stock_movements_item_idx on public.stock_movements (business_id, item_id, created_at desc);
create index stock_movements_business_idx on public.stock_movements (business_id, created_at desc);
create index stock_movements_date_idx on public.stock_movements (business_id, date_key);
create index restocks_business_idx on public.restocks (business_id, received_on desc);

-- History can only grow.
create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function private.forbid_change();
create trigger stock_movements_no_truncate
  before truncate on public.stock_movements
  for each statement execute function private.forbid_change();
create trigger restocks_append_only
  before update or delete on public.restocks
  for each row execute function private.forbid_change();
create trigger restocks_no_truncate
  before truncate on public.restocks
  for each statement execute function private.forbid_change();

-- Items are archived, never deleted.
create trigger items_no_delete
  before delete on public.items
  for each row execute function private.forbid_change();
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only, own business only
-- ---------------------------------------------------------------------------

alter table public.items enable row level security;
alter table public.item_costs enable row level security;
alter table public.restocks enable row level security;
alter table public.stock_movements enable row level security;

grant select on public.items, public.item_costs, public.restocks, public.stock_movements
  to authenticated;

-- Staff see the items on sale. Owners also see archived items.
create policy "Members can read their business's items"
  on public.items for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (active or (select private.my_role()) = 'owner')
  );

create policy "Owners can read cost prices"
  on public.item_costs for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (select private.my_role()) = 'owner'
  );

create policy "Owners can read restocks"
  on public.restocks for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (select private.my_role()) = 'owner'
  );

create policy "Owners can read the stock ledger"
  on public.stock_movements for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (select private.my_role()) = 'owner'
  );

-- ---------------------------------------------------------------------------
-- Functions the owner calls from the browser
-- ---------------------------------------------------------------------------

-- Creates an item, or updates it if it already exists.
-- The app chooses the id for a new item, so a double tap or a retry cannot
-- create two items: the second call becomes a harmless update.
-- Quantity is NOT changed here, except the opening quantity of a new item,
-- which is recorded as an 'opening' movement. After that, use restocks and
-- adjustments.
-- A null cost price removes the cost price. A null low-stock level keeps the
-- current one (or uses the business default for a new item).
create function public.upsert_item(
  p_item_id uuid,
  p_name text,
  p_category text,
  p_unit text,
  p_price bigint,
  p_cost_price bigint,
  p_low_stock_level integer,
  p_opening_quantity integer default 0
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid := private.require_owner(v_user_id);
  v_name text := private.clean_text(p_name);
  v_category text := private.clean_text(p_category);
  v_unit text := private.clean_text(p_unit);
  v_opening integer := coalesce(p_opening_quantity, 0);
  v_low integer;
  v_constraint text;
begin
  if p_item_id is null
    or v_name is null or char_length(v_name) > 80
    or char_length(coalesce(v_category, '')) > 40
    or char_length(coalesce(v_unit, '')) > 20
    or p_price is null or p_price not between 0 and 1000000000000
    or p_cost_price not between 0 and 1000000000000
    or p_low_stock_level not between 0 and 1000000
    or v_opening not between 0 and 1000000000 then
    perform private.fail('validation');
  end if;

  perform 1 from public.items i
  where i.id = p_item_id and i.business_id = v_business_id
  for update;

  if found then
    update public.items i
    set
      name = v_name,
      category = v_category,
      unit = v_unit,
      price = p_price,
      low_stock_level = coalesce(p_low_stock_level, i.low_stock_level)
    where i.id = p_item_id;
  else
    select coalesce(p_low_stock_level, b.default_low_stock_level) into v_low
    from public.businesses b
    where b.id = v_business_id;

    insert into public.items (id, business_id, name, category, unit, price, quantity, low_stock_level)
    values (p_item_id, v_business_id, v_name, v_category, v_unit, p_price, v_opening, v_low);

    if v_opening > 0 then
      insert into public.stock_movements (
        business_id, item_id, item_name, type, delta, quantity_before, quantity_after,
        created_by, created_by_name, date_key
      ) values (
        v_business_id, p_item_id, v_name, 'opening', v_opening, 0, v_opening,
        v_user_id, private.display_name(v_user_id), private.business_today(v_business_id)
      );
    end if;
  end if;

  if p_cost_price is null then
    delete from public.item_costs c where c.item_id = p_item_id;
  else
    insert into public.item_costs as c (item_id, business_id, cost_price)
    values (p_item_id, v_business_id, p_cost_price)
    on conflict (item_id) do update set cost_price = excluded.cost_price, updated_at = now();
  end if;

  return p_item_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'items_business_id_name_lower_key' then
      perform private.fail('item_name_taken');
    end if;
    if v_constraint = 'items_pkey' then
      -- The id belongs to an item in another business.
      perform private.fail('conflict');
    end if;
    raise;
end;
$$;

create function private.set_item_active(p_item_id uuid, p_active boolean) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner((select auth.uid()));
begin
  update public.items i
  set active = p_active
  where i.id = p_item_id and i.business_id = v_business_id;

  if not found then
    perform private.fail('not_found');
  end if;
end;
$$;

-- Hides an item from selling and from staff. Its history and stock stay.
create function public.archive_item(p_item_id uuid) returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select private.set_item_active(p_item_id, false)
$$;

create function public.restore_item(p_item_id uuid) returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select private.set_item_active(p_item_id, true)
$$;

-- Records one delivery: several items received at once, each adding to stock.
-- p_lines: [{"item_id": "...", "quantity": 24, "unit_cost": 28000}, ...]
-- (unit_cost in minor units, optional). Saving the same p_client_id twice
-- returns the first delivery and adds nothing.
create function public.record_restock(
  p_client_id uuid,
  p_received_on date,
  p_supplier text,
  p_note text,
  p_lines jsonb
) returns uuid
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
  v_supplier text := private.clean_text(p_supplier);
  v_note text := private.clean_text(p_note);
  v_restock_id uuid;
  v_line record;
  v_item public.items%rowtype;
  v_constraint text;
begin
  if p_client_id is null then
    perform private.fail('validation');
  end if;

  -- Already saved: a retry or a double tap. Return the same delivery.
  select r.id into v_restock_id
  from public.restocks r
  where r.business_id = v_business_id and r.client_id = p_client_id;
  if found then
    return v_restock_id;
  end if;

  if p_received_on is null
    or p_received_on > v_today
    or p_received_on < v_today - 366
    or char_length(coalesce(v_supplier, '')) > 80
    or char_length(coalesce(v_note, '')) > 200
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) not between 1 and 100 then
    perform private.fail('validation');
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as l (item_id uuid, quantity integer, unit_cost bigint)
    where l.item_id is null
      or l.quantity is null
      or l.quantity not between 1 and 1000000
      or l.unit_cost not between 0 and 1000000000000
  )
  -- Each item once per delivery.
  or (
    select count(distinct l.item_id)
    from jsonb_to_recordset(p_lines) as l (item_id uuid)
  ) <> jsonb_array_length(p_lines) then
    perform private.fail('validation');
  end if;

  insert into public.restocks (
    business_id, client_id, supplier, note, received_on, created_by, created_by_name
  ) values (
    v_business_id, p_client_id, v_supplier, v_note, p_received_on, v_user_id, v_user_name
  )
  returning id into v_restock_id;

  -- Lock items in a fixed order, so two deliveries at once cannot deadlock.
  for v_line in
    select l.item_id, l.quantity, l.unit_cost
    from jsonb_to_recordset(p_lines) as l (item_id uuid, quantity integer, unit_cost bigint)
    order by l.item_id
  loop
    select * into v_item
    from public.items i
    where i.id = v_line.item_id and i.business_id = v_business_id
    for update;

    if not found then
      perform private.fail('not_found');
    end if;
    if not v_item.active then
      perform private.fail('item_archived');
    end if;

    update public.items i
    set quantity = i.quantity + v_line.quantity
    where i.id = v_item.id;

    insert into public.stock_movements (
      business_id, item_id, item_name, type, delta, quantity_before, quantity_after,
      note, restock_id, supplier, unit_cost, created_by, created_by_name, date_key
    ) values (
      v_business_id, v_item.id, v_item.name, 'restock', v_line.quantity,
      v_item.quantity, v_item.quantity + v_line.quantity,
      v_note, v_restock_id, v_supplier, v_line.unit_cost, v_user_id, v_user_name, v_today
    );
  end loop;

  return v_restock_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'restocks_business_id_client_id_key' then
      -- The same delivery was saved by a request that arrived a moment earlier.
      return (
        select r.id from public.restocks r
        where r.business_id = v_business_id and r.client_id = p_client_id
      );
    end if;
    raise;
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.fail('validation');
end;
$$;

-- Sets an item's stock to what was actually counted, with a reason.
-- p_expected_quantity is the quantity the owner saw when they counted. If
-- stock changed since (a sale, a delivery), the adjustment is refused with
-- 'conflict', so a count is never applied to the wrong starting point.
create function public.adjust_stock(
  p_item_id uuid,
  p_counted_quantity integer,
  p_expected_quantity integer,
  p_reason text,
  p_note text
) returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid := private.require_owner(v_user_id);
  v_note text := private.clean_text(p_note);
  v_item public.items%rowtype;
begin
  if p_counted_quantity is null
    or p_counted_quantity not between 0 and 1000000000
    or p_expected_quantity is null
    or p_reason is null
    or p_reason not in ('damaged', 'expired', 'lost_or_stolen', 'miscount', 'other')
    or char_length(coalesce(v_note, '')) > 200
    -- "Other" always needs a few words of explanation.
    or (p_reason = 'other' and v_note is null) then
    perform private.fail('validation');
  end if;

  select * into v_item
  from public.items i
  where i.id = p_item_id and i.business_id = v_business_id
  for update;

  if not found then
    perform private.fail('not_found');
  end if;
  if v_item.quantity <> p_expected_quantity then
    perform private.fail('conflict');
  end if;
  if p_counted_quantity = v_item.quantity then
    -- Nothing to change.
    perform private.fail('validation');
  end if;

  update public.items i set quantity = p_counted_quantity where i.id = v_item.id;

  insert into public.stock_movements (
    business_id, item_id, item_name, type, delta, quantity_before, quantity_after,
    reason, note, created_by, created_by_name, date_key
  ) values (
    v_business_id, v_item.id, v_item.name, 'adjustment', p_counted_quantity - v_item.quantity,
    v_item.quantity, p_counted_quantity,
    p_reason, v_note, v_user_id, private.display_name(v_user_id),
    private.business_today(v_business_id)
  );

  return p_counted_quantity;
end;
$$;

grant execute on function public.upsert_item(uuid, text, text, text, bigint, bigint, integer, integer)
  to authenticated;
grant execute on function public.archive_item(uuid) to authenticated;
grant execute on function public.restore_item(uuid) to authenticated;
grant execute on function public.record_restock(uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- For tests and operations: items whose quantity does not match their ledger.
-- Should always return nothing.
-- ---------------------------------------------------------------------------

create function private.stock_mismatches(p_business_id uuid)
returns table (item_id uuid, quantity integer, ledger_total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.quantity, coalesce(sum(m.delta), 0)
  from public.items i
  left join public.stock_movements m on m.item_id = i.id and m.business_id = i.business_id
  where i.business_id = p_business_id
  group by i.id, i.quantity
  having i.quantity <> coalesce(sum(m.delta), 0)
$$;
