-- Phase 2B: shared supplies (stock counted by packaging or materials).
--
-- Some businesses count the packaging, not each product: apple juice, Fanta and
-- Coke all use the same 300 ml bottle, and the business tracks 1,000 bottles.
-- Each item chooses how its stock is counted, with two independent switches:
--   - tracks_own_stock (default true): the item has its own quantity;
--   - item_supplies rows: each unit sold also uses whole numbers of supplies.
-- Both, either or neither (food made to order) are allowed.
--
-- The same rules are written in web/src/domain/supplies.ts and checked by the
-- shared contract tests (web/src/api/contract/supplies.contract.ts).
-- Sales and voids that deduct supplies arrive with orders (Phase 2C).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.items
  add column tracks_own_stock boolean not null default true;

comment on column public.items.tracks_own_stock is
  'False when the item does not count its own stock. Its quantity is then kept, unchanged and unused.';

create table public.supplies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  name_lower text generated always as (lower(name)) stored,
  unit text check (char_length(unit) between 1 and 20),
  -- Whole units on hand. Changed only by the functions below (and orders, Phase 2C).
  quantity integer not null default 0 check (quantity >= 0),
  low_stock_level integer not null default 0 check (low_stock_level between 0 and 1000000),
  -- false = archived. Supplies are never deleted.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name_lower),
  unique (id, business_id)
);

comment on table public.supplies is
  'Stock shared by several items (bottles, caps). Quantity always equals the sum of its stock movements.';

-- Kept apart so that only the owner can ever read supply costs.
create table public.supply_costs (
  supply_id uuid primary key,
  business_id uuid not null,
  cost_price bigint not null check (cost_price between 0 and 1000000000000),
  updated_at timestamptz not null default now(),
  foreign key (supply_id, business_id) references public.supplies (id, business_id) on delete cascade
);

-- What one unit sold of an item uses from each supply.
create table public.item_supplies (
  item_id uuid not null,
  supply_id uuid not null,
  business_id uuid not null,
  units_per_sale integer not null check (units_per_sale between 1 and 1000),
  primary key (item_id, supply_id),
  foreign key (item_id, business_id) references public.items (id, business_id),
  foreign key (supply_id, business_id) references public.supplies (id, business_id)
);

create index item_supplies_supply_idx on public.item_supplies (supply_id);

-- A permanent record of every change to how an item counts stock.
create table public.stock_mode_changes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  item_id uuid not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_by_name text not null,
  changed_at timestamptz not null default now(),
  -- {"tracks_own_stock": true, "supplies": [{"supply_id": "...", "units_per_sale": 1}]}
  before jsonb not null,
  after jsonb not null,
  foreign key (item_id, business_id) references public.items (id, business_id)
);

create index stock_mode_changes_item_idx on public.stock_mode_changes (business_id, item_id, changed_at desc);

-- The ledger now holds supply entries too: exactly one of item_id and supply_id.
alter table public.stock_movements
  alter column item_id drop not null,
  add column supply_id uuid,
  -- For a supply used by a sale (or returned by a void): the item that used it.
  add column source_item_id uuid,
  add column source_item_name text,
  add constraint stock_movements_supply_fk
    foreign key (supply_id, business_id) references public.supplies (id, business_id),
  add constraint stock_movements_one_target
    check ((item_id is null) <> (supply_id is null)),
  add constraint stock_movements_source_only_on_supplies
    check (source_item_id is null or supply_id is not null);

comment on column public.stock_movements.item_name is
  'The item''s or the supply''s name at the time (a snapshot).';

create index stock_movements_supply_idx on public.stock_movements (business_id, supply_id, created_at desc);

-- History can only grow; supplies are archived, never deleted.
create trigger stock_mode_changes_append_only
  before update or delete on public.stock_mode_changes
  for each row execute function private.forbid_change();
create trigger stock_mode_changes_no_truncate
  before truncate on public.stock_mode_changes
  for each statement execute function private.forbid_change();
create trigger supplies_no_delete
  before delete on public.supplies
  for each row execute function private.forbid_change();
create trigger supplies_touch_updated_at
  before update on public.supplies
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only, own business only
-- ---------------------------------------------------------------------------

alter table public.supplies enable row level security;
alter table public.supply_costs enable row level security;
alter table public.item_supplies enable row level security;
alter table public.stock_mode_changes enable row level security;

grant select on public.supplies, public.supply_costs, public.item_supplies, public.stock_mode_changes
  to authenticated;

-- Staff see supplies in use, so the app can show how many of an item can be
-- sold. They never see costs. Owners also see archived supplies.
create policy "Members can read their business's supplies"
  on public.supplies for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (active or (select private.my_role()) = 'owner')
  );

create policy "Owners can read supply costs"
  on public.supply_costs for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (select private.my_role()) = 'owner'
  );

create policy "Members can read which supplies items use"
  on public.item_supplies for select to authenticated
  using (business_id = (select private.my_business_id()));

create policy "Owners can read stock mode changes"
  on public.stock_mode_changes for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (select private.my_role()) = 'owner'
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- An item's stock mode as stored in stock_mode_changes. Supplies sorted, so
-- two modes can be compared as values.
create function private.stock_mode_of(p_item_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tracks_own_stock', i.tracks_own_stock,
    'supplies', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('supply_id', s.supply_id, 'units_per_sale', s.units_per_sale)
          order by s.supply_id
        )
        from public.item_supplies s
        where s.item_id = i.id
      ),
      '[]'::jsonb
    )
  )
  from public.items i
  where i.id = p_item_id
$$;

-- ---------------------------------------------------------------------------
-- Items: now with how stock is counted
-- ---------------------------------------------------------------------------

drop function public.upsert_item(uuid, text, text, text, bigint, bigint, integer, integer);

-- Creates an item, or updates it if it already exists (the app chooses the id,
-- so a retry never creates two). Quantity is NOT changed here, except the
-- opening count of a new item that counts its own stock.
-- p_supplies: [{"supply_id": "...", "units_per_sale": 1}, ...] ([] for none).
-- A change to tracks_own_stock or the supplies applies to new sales only and is
-- recorded in stock_mode_changes.
create function public.upsert_item(
  p_item_id uuid,
  p_name text,
  p_category text,
  p_unit text,
  p_price bigint,
  p_cost_price bigint,
  p_low_stock_level integer,
  p_opening_quantity integer default 0,
  p_tracks_own_stock boolean default true,
  p_supplies jsonb default '[]'::jsonb
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
  v_supplies jsonb := coalesce(p_supplies, '[]'::jsonb);
  v_existing boolean;
  v_before jsonb;
  v_after jsonb;
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
    or v_opening not between 0 and 1000000000
    or p_tracks_own_stock is null
    or jsonb_typeof(v_supplies) is distinct from 'array'
    or jsonb_array_length(v_supplies) > 10 then
    perform private.fail('validation');
  end if;

  -- Each supply once, whole units of at least 1.
  if exists (
    select 1
    from jsonb_to_recordset(v_supplies) as s (supply_id uuid, units_per_sale integer)
    where s.supply_id is null or s.units_per_sale is null or s.units_per_sale not between 1 and 1000
  )
  or (
    select count(distinct s.supply_id)
    from jsonb_to_recordset(v_supplies) as s (supply_id uuid)
  ) <> jsonb_array_length(v_supplies) then
    perform private.fail('validation');
  end if;

  -- Every supply belongs to this business and is in use.
  if exists (
    select 1
    from jsonb_to_recordset(v_supplies) as s (supply_id uuid)
    where not exists (
      select 1 from public.supplies x where x.id = s.supply_id and x.business_id = v_business_id
    )
  ) then
    perform private.fail('not_found');
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_supplies) as s (supply_id uuid)
    join public.supplies x on x.id = s.supply_id
    where not x.active
  ) then
    perform private.fail('item_archived');
  end if;

  perform 1 from public.items i
  where i.id = p_item_id and i.business_id = v_business_id
  for update;
  v_existing := found;

  if v_existing then
    v_before := private.stock_mode_of(p_item_id);
    update public.items i
    set
      name = v_name,
      category = v_category,
      unit = v_unit,
      price = p_price,
      tracks_own_stock = p_tracks_own_stock,
      low_stock_level = coalesce(p_low_stock_level, i.low_stock_level)
    where i.id = p_item_id;
  else
    -- An opening count only makes sense for an item that counts its own stock.
    if not p_tracks_own_stock and v_opening > 0 then
      perform private.fail('validation');
    end if;

    select coalesce(p_low_stock_level, b.default_low_stock_level) into v_low
    from public.businesses b
    where b.id = v_business_id;

    insert into public.items (
      id, business_id, name, category, unit, price, tracks_own_stock, quantity, low_stock_level
    ) values (
      p_item_id, v_business_id, v_name, v_category, v_unit, p_price, p_tracks_own_stock, v_opening, v_low
    );

    -- The opening count is added. Nothing is ever deducted from supplies here.
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

  delete from public.item_supplies s where s.item_id = p_item_id;
  insert into public.item_supplies (item_id, supply_id, business_id, units_per_sale)
  select p_item_id, s.supply_id, v_business_id, s.units_per_sale
  from jsonb_to_recordset(v_supplies) as s (supply_id uuid, units_per_sale integer);

  if v_existing then
    v_after := private.stock_mode_of(p_item_id);
    if v_after is distinct from v_before then
      insert into public.stock_mode_changes (
        business_id, item_id, changed_by, changed_by_name, before, after
      ) values (
        v_business_id, p_item_id, v_user_id, private.display_name(v_user_id), v_before, v_after
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
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.fail('validation');
end;
$$;

grant execute on function public.upsert_item(
  uuid, text, text, text, bigint, bigint, integer, integer, boolean, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- Supplies
-- ---------------------------------------------------------------------------

-- Creates a supply, or updates it if it already exists (the app chooses the id).
-- Quantity is NOT changed here, except the opening count of a new supply.
create function public.upsert_supply(
  p_supply_id uuid,
  p_name text,
  p_unit text,
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
  v_unit text := private.clean_text(p_unit);
  v_opening integer := coalesce(p_opening_quantity, 0);
  v_low integer;
  v_constraint text;
begin
  if p_supply_id is null
    or v_name is null or char_length(v_name) > 80
    or char_length(coalesce(v_unit, '')) > 20
    or p_cost_price not between 0 and 1000000000000
    or p_low_stock_level not between 0 and 1000000
    or v_opening not between 0 and 1000000000 then
    perform private.fail('validation');
  end if;

  perform 1 from public.supplies s
  where s.id = p_supply_id and s.business_id = v_business_id
  for update;

  if found then
    update public.supplies s
    set name = v_name, unit = v_unit, low_stock_level = coalesce(p_low_stock_level, s.low_stock_level)
    where s.id = p_supply_id;
  else
    select coalesce(p_low_stock_level, b.default_low_stock_level) into v_low
    from public.businesses b
    where b.id = v_business_id;

    insert into public.supplies (id, business_id, name, unit, quantity, low_stock_level)
    values (p_supply_id, v_business_id, v_name, v_unit, v_opening, v_low);

    if v_opening > 0 then
      insert into public.stock_movements (
        business_id, supply_id, item_name, type, delta, quantity_before, quantity_after,
        created_by, created_by_name, date_key
      ) values (
        v_business_id, p_supply_id, v_name, 'opening', v_opening, 0, v_opening,
        v_user_id, private.display_name(v_user_id), private.business_today(v_business_id)
      );
    end if;
  end if;

  if p_cost_price is null then
    delete from public.supply_costs c where c.supply_id = p_supply_id;
  else
    insert into public.supply_costs as c (supply_id, business_id, cost_price)
    values (p_supply_id, v_business_id, p_cost_price)
    on conflict (supply_id) do update set cost_price = excluded.cost_price, updated_at = now();
  end if;

  return p_supply_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'supplies_business_id_name_lower_key' then
      perform private.fail('supply_name_taken');
    end if;
    if v_constraint = 'supplies_pkey' then
      perform private.fail('conflict');
    end if;
    raise;
end;
$$;

-- Hides a supply. Refused while an item on sale still uses it: archiving it
-- would quietly stop those items selling.
create function public.archive_supply(p_supply_id uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner((select auth.uid()));
begin
  perform 1 from public.supplies s
  where s.id = p_supply_id and s.business_id = v_business_id
  for update;
  if not found then
    perform private.fail('not_found');
  end if;

  if exists (
    select 1
    from public.item_supplies u
    join public.items i on i.id = u.item_id
    where u.supply_id = p_supply_id and i.active
  ) then
    perform private.fail('supply_in_use');
  end if;

  update public.supplies set active = false where id = p_supply_id;
end;
$$;

create function public.restore_supply(p_supply_id uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner((select auth.uid()));
begin
  update public.supplies s
  set active = true
  where s.id = p_supply_id and s.business_id = v_business_id;
  if not found then
    perform private.fail('not_found');
  end if;
end;
$$;

grant execute on function public.upsert_supply(uuid, text, text, bigint, integer, integer) to authenticated;
grant execute on function public.archive_supply(uuid) to authenticated;
grant execute on function public.restore_supply(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Restock and adjust: items or supplies
-- ---------------------------------------------------------------------------

-- Records one delivery of items and supplies.
-- p_lines: [{"item_id": "...", "quantity": 24, "unit_cost": 28000},
--           {"supply_id": "...", "quantity": 500}, ...]
-- Each line names exactly one item or supply. Items that don't count their own
-- stock are refused with 'stock_not_counted' (restock their supplies instead).
-- Saving the same p_client_id twice returns the first delivery and adds nothing.
create or replace function public.record_restock(
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
  v_supply public.supplies%rowtype;
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
    from jsonb_to_recordset(p_lines)
      as l (item_id uuid, supply_id uuid, quantity integer, unit_cost bigint)
    where (l.item_id is null) = (l.supply_id is null)
      or l.quantity is null
      or l.quantity not between 1 and 1000000
      or l.unit_cost not between 0 and 1000000000000
  )
  -- Each item and each supply once per delivery.
  or (
    select count(distinct coalesce(l.item_id, l.supply_id))
    from jsonb_to_recordset(p_lines) as l (item_id uuid, supply_id uuid)
  ) <> jsonb_array_length(p_lines) then
    perform private.fail('validation');
  end if;

  insert into public.restocks (
    business_id, client_id, supplier, note, received_on, created_by, created_by_name
  ) values (
    v_business_id, p_client_id, v_supplier, v_note, p_received_on, v_user_id, v_user_name
  )
  returning id into v_restock_id;

  -- Lock rows in a fixed order (supplies, then items, each by id), so two
  -- deliveries at once cannot deadlock.
  for v_line in
    select l.item_id, l.supply_id, l.quantity, l.unit_cost
    from jsonb_to_recordset(p_lines)
      as l (item_id uuid, supply_id uuid, quantity integer, unit_cost bigint)
    order by (l.supply_id is null), coalesce(l.supply_id, l.item_id)
  loop
    if v_line.supply_id is not null then
      select * into v_supply
      from public.supplies s
      where s.id = v_line.supply_id and s.business_id = v_business_id
      for update;
      if not found then
        perform private.fail('not_found');
      end if;
      if not v_supply.active then
        perform private.fail('item_archived');
      end if;

      update public.supplies s set quantity = s.quantity + v_line.quantity where s.id = v_supply.id;

      insert into public.stock_movements (
        business_id, supply_id, item_name, type, delta, quantity_before, quantity_after,
        note, restock_id, supplier, unit_cost, created_by, created_by_name, date_key
      ) values (
        v_business_id, v_supply.id, v_supply.name, 'restock', v_line.quantity,
        v_supply.quantity, v_supply.quantity + v_line.quantity,
        v_note, v_restock_id, v_supplier, v_line.unit_cost, v_user_id, v_user_name, v_today
      );
    else
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
      if not v_item.tracks_own_stock then
        perform private.fail('stock_not_counted');
      end if;

      update public.items i set quantity = i.quantity + v_line.quantity where i.id = v_item.id;

      insert into public.stock_movements (
        business_id, item_id, item_name, type, delta, quantity_before, quantity_after,
        note, restock_id, supplier, unit_cost, created_by, created_by_name, date_key
      ) values (
        v_business_id, v_item.id, v_item.name, 'restock', v_line.quantity,
        v_item.quantity, v_item.quantity + v_line.quantity,
        v_note, v_restock_id, v_supplier, v_line.unit_cost, v_user_id, v_user_name, v_today
      );
    end if;
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

drop function public.adjust_stock(uuid, integer, integer, text, text);

-- Sets an item's own stock, or a supply, to what was actually counted, with a
-- reason. Exactly one of p_item_id and p_supply_id. p_expected_quantity is what
-- the owner saw when they counted: if stock changed since, the adjustment is
-- refused with 'conflict' (the app then shows the new quantity).
create function public.adjust_stock(
  p_item_id uuid,
  p_supply_id uuid,
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
  v_supply public.supplies%rowtype;
  v_current integer;
begin
  if (p_item_id is null) = (p_supply_id is null)
    or p_counted_quantity is null
    or p_counted_quantity not between 0 and 1000000000
    or p_expected_quantity is null
    or p_reason is null
    or p_reason not in ('damaged', 'expired', 'lost_or_stolen', 'miscount', 'other')
    or char_length(coalesce(v_note, '')) > 200
    -- "Other" always needs a few words of explanation.
    or (p_reason = 'other' and v_note is null) then
    perform private.fail('validation');
  end if;

  if p_supply_id is not null then
    select * into v_supply
    from public.supplies s
    where s.id = p_supply_id and s.business_id = v_business_id
    for update;
    if not found then
      perform private.fail('not_found');
    end if;
    -- Archived supplies can still be counted (for example, down to zero).
    v_current := v_supply.quantity;
  else
    select * into v_item
    from public.items i
    where i.id = p_item_id and i.business_id = v_business_id
    for update;
    if not found then
      perform private.fail('not_found');
    end if;
    -- Archived items can still be counted (for example, down to zero).
    if not v_item.tracks_own_stock then
      perform private.fail('stock_not_counted');
    end if;
    v_current := v_item.quantity;
  end if;

  if v_current <> p_expected_quantity then
    perform private.fail('conflict');
  end if;
  if p_counted_quantity = v_current then
    -- Nothing to change.
    perform private.fail('validation');
  end if;

  if p_supply_id is not null then
    update public.supplies s set quantity = p_counted_quantity where s.id = v_supply.id;
  else
    update public.items i set quantity = p_counted_quantity where i.id = v_item.id;
  end if;

  insert into public.stock_movements (
    business_id, item_id, supply_id, item_name, type, delta, quantity_before, quantity_after,
    reason, note, created_by, created_by_name, date_key
  ) values (
    v_business_id, p_item_id, p_supply_id, coalesce(v_item.name, v_supply.name), 'adjustment',
    p_counted_quantity - v_current, v_current, p_counted_quantity,
    p_reason, v_note, v_user_id, private.display_name(v_user_id),
    private.business_today(v_business_id)
  );

  return p_counted_quantity;
end;
$$;

grant execute on function public.adjust_stock(uuid, uuid, integer, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- For tests and operations: stock whose quantity does not match its ledger.
-- Should always return nothing. Covers items and supplies.
-- ---------------------------------------------------------------------------

drop function private.stock_mismatches(uuid);

create function private.stock_mismatches(p_business_id uuid)
returns table (kind text, id uuid, quantity integer, ledger_total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select 'item', i.id, i.quantity, coalesce(sum(m.delta), 0)
  from public.items i
  left join public.stock_movements m on m.item_id = i.id and m.business_id = i.business_id
  where i.business_id = p_business_id
  group by i.id, i.quantity
  having i.quantity <> coalesce(sum(m.delta), 0)
  union all
  select 'supply', s.id, s.quantity, coalesce(sum(m.delta), 0)
  from public.supplies s
  left join public.stock_movements m on m.supply_id = s.id and m.business_id = s.business_id
  where s.business_id = p_business_id
  group by s.id, s.quantity
  having s.quantity <> coalesce(sum(m.delta), 0)
$$;
