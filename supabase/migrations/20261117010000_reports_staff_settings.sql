-- Phase 2D: the owner's dashboard and reports, turning staff accounts off and
-- on, business settings, and the logo bucket.
--
-- The sums follow web/src/domain/reports.ts and salesReport.ts (checked by the
-- shared contract tests): voided orders never count as sales and are counted
-- on their own; best sellers come from completed orders' own lines, by amount
-- then quantity; supply use counts completed orders only.
--
-- Everything here is read by the owner only. The browser still writes nothing
-- directly: settings and staff changes are functions, and the logo file is
-- stored by an Edge Function with the secret key.

-- ---------------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------------

-- One business day's totals, from the totals kept with every order and void.
create function private.day_summary(p_business_id uuid, p_date date) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'date_key', p_date,
    'sales', coalesce(d.total_sales, 0),
    'orders', coalesce(d.order_count, 0),
    'voided', coalesce(d.voided_count, 0),
    'voided_total', coalesce(d.voided_total, 0),
    'by_payment_method',
      coalesce(d.by_payment_method, '{"cash":0,"bank_transfer":0,"card":0}'::jsonb)
  )
  from (select 1) as one
  left join public.daily_summaries d on d.business_id = p_business_id and d.date_key = p_date
$$;

-- Best sellers among completed orders, by amount, then quantity, then who sold first.
create function private.item_sales(p_business_id uuid, p_from date, p_to date, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('item_id', s.item_id, 'name', s.name, 'quantity', s.quantity, 'sales', s.sales)
      order by s.sales desc, s.quantity desc, s.first_sold, s.first_line
    ),
    '[]'::jsonb
  )
  from (
    select
      l.item_id,
      -- The name it was sold under first (orders keep the name at the time).
      (array_agg(l.name order by o.created_at, l.line_no))[1] as name,
      sum(l.qty) as quantity,
      sum(l.line_total) as sales,
      min(o.created_at) as first_sold,
      min(l.line_no) as first_line
    from public.orders o
    join public.order_lines l on l.order_id = o.id and l.business_id = o.business_id
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.date_key between p_from and p_to
    group by l.item_id
    order by sales desc, quantity desc, first_sold, first_line
    limit p_limit
  ) s
$$;

-- Today and yesterday in the business's own time zone, and today's best sellers.
-- Low stock comes from the item and supply lists the owner already reads.
create function public.owner_dashboard() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner((select auth.uid()));
  v_today date := private.business_today(v_business_id);
begin
  return jsonb_build_object(
    'today', private.day_summary(v_business_id, v_today),
    'yesterday', private.day_summary(v_business_id, v_today - 1),
    'top_items_today', private.item_sales(v_business_id, v_today, v_today, 5)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales report over a range of business days (at most 366)
-- ---------------------------------------------------------------------------

-- The sums over orders. The app adds what is true now (stock value, items that
-- sold nothing, what is left of each supply) from the lists it already reads.
create function public.sales_report(p_from date, p_to date) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner((select auth.uid()));
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 366 then
    perform private.fail('validation');
  end if;

  with
    in_range as (
      select o.*
      from public.orders o
      where o.business_id = v_business_id and o.date_key between p_from and p_to
    ),
    completed as (select * from in_range where status = 'completed')
  select jsonb_build_object(
    'sales', (select coalesce(sum(c.total), 0) from completed c),
    'orders', (select count(*) from completed),
    'voided', (select count(*) from in_range r where r.status = 'voided'),
    'voided_total', (select coalesce(sum(r.total), 0) from in_range r where r.status = 'voided'),
    'by_payment_method', (
      select jsonb_object_agg(m.method, jsonb_build_object('sales', m.sales, 'orders', m.orders))
      from (
        select v.method, coalesce(sum(c.total), 0) as sales, count(c.id) as orders
        from (values ('cash'), ('bank_transfer'), ('card')) as v (method)
        left join completed c on c.payment_method = v.method
        group by v.method
      ) m
    ),
    'by_staff', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'staff_id', s.staff_id, 'staff_name', s.staff_name, 'sales', s.sales, 'orders', s.orders
          )
          order by s.sales desc, s.first_sold
        ),
        '[]'::jsonb
      )
      from (
        select
          coalesce(c.staff_id::text, '') as staff_id,
          (array_agg(c.staff_name order by c.created_at))[1] as staff_name,
          sum(c.total) as sales,
          count(*) as orders,
          min(c.created_at) as first_sold
        from completed c
        group by 1
      ) s
    ),
    'by_day', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('date_key', d.date_key, 'sales', d.sales, 'orders', d.orders)
          order by d.date_key
        ),
        '[]'::jsonb
      )
      from (
        select c.date_key, sum(c.total) as sales, count(*) as orders
        from completed c
        group by c.date_key
      ) d
    ),
    'items', private.item_sales(v_business_id, p_from, p_to, null),
    -- Shared supplies used by completed orders, per supply and the item that used it.
    'supply_use', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'supply_id', u.supply_id,
            'source_item_id', u.source_item_id,
            'source_item_name', u.source_item_name,
            'used', u.used
          )
          order by u.supply_id, u.used desc, u.first_used
        ),
        '[]'::jsonb
      )
      from (
        select
          m.supply_id,
          m.source_item_id,
          (array_agg(m.source_item_name order by m.created_at))[1] as source_item_name,
          sum(-m.delta) as used,
          min(m.created_at) as first_used
        from public.stock_movements m
        join completed c on c.id = m.order_id
        where m.business_id = v_business_id and m.supply_id is not null and m.type = 'sale'
        group by m.supply_id, m.source_item_id
      ) u
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff accounts: off and on
-- ---------------------------------------------------------------------------

-- A turned-off account can't sign in, and Row Level Security stops its reads at
-- once (my_business_id needs an active profile). Never deleted.
create function public.set_staff_active(p_staff_id uuid, p_active boolean) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner((select auth.uid()));
begin
  if p_active is null then
    perform private.fail('validation');
  end if;

  update public.profiles p
  set active = p_active
  where p.id = p_staff_id and p.business_id = v_business_id and p.role = 'staff';
  if not found then
    perform private.fail('not_found');
  end if;

  if not p_active then
    -- Sign them out everywhere. Reads are refused already; this is tidying up.
    begin
      delete from auth.sessions s where s.user_id = p_staff_id;
    exception
      when insufficient_privilege or undefined_table then
        null;
    end;
  end if;
end;
$$;

-- For the reset-staff-password Edge Function: may this owner reset this person?
create function public.staff_reset_precheck(p_owner_id uuid, p_staff_id uuid) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner(p_owner_id);
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_staff_id and p.business_id = v_business_id and p.role = 'staff'
  ) then
    perform private.fail('not_found');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Business settings
-- ---------------------------------------------------------------------------

create function public.update_business_settings(
  p_name text,
  p_currency_code text,
  p_timezone text,
  p_address text,
  p_phone text,
  p_receipt_footer text,
  p_default_low_stock_level integer
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner((select auth.uid()));
  v_name text := private.clean_text(p_name);
  v_currency text := upper(trim(coalesce(p_currency_code, '')));
  v_timezone text := trim(coalesce(p_timezone, ''));
  v_address text := private.clean_text(p_address);
  v_phone text := private.clean_text(p_phone);
  v_footer text := private.clean_text(p_receipt_footer);
begin
  if v_name is null or char_length(v_name) not between 2 and 80
    or v_currency !~ '^[A-Z]{3}$'
    or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone)
    or char_length(coalesce(v_address, '')) > 200
    or char_length(coalesce(v_phone, '')) > 30
    or char_length(coalesce(v_footer, '')) > 200
    or p_default_low_stock_level is null
    or p_default_low_stock_level not between 0 and 1000000 then
    perform private.fail('validation');
  end if;

  update public.businesses b
  set
    name = v_name,
    currency_code = v_currency,
    timezone = v_timezone,
    address = v_address,
    phone = v_phone,
    receipt_footer = v_footer,
    default_low_stock_level = p_default_low_stock_level
  where b.id = v_business_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Logo: a public bucket written only by the update-business-logo Edge Function
-- ---------------------------------------------------------------------------

-- Public to read (a logo is printed on every receipt anyway). There are no
-- write policies on storage.objects, so only the secret key can add or remove
-- files. 300 KB at most, pictures only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 307200, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- For the Edge Function: the business of an owner who may change its logo.
create function public.owner_precheck(p_owner_id uuid) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.require_owner(p_owner_id)
$$;

-- For the Edge Function: points the business at its new logo file (or none) and
-- returns the old file's path, so the function can remove it.
create function public.set_business_logo(p_owner_id uuid, p_logo_path text) returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner(p_owner_id);
  v_old text;
begin
  -- Files live under the business's own folder, with a random name.
  if p_logo_path is not null
    and p_logo_path !~ ('^' || v_business_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then
    perform private.fail('validation');
  end if;

  select b.logo_path into v_old
  from public.businesses b
  where b.id = v_business_id
  for update;

  update public.businesses b set logo_path = p_logo_path where b.id = v_business_id;
  return v_old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

grant execute on function public.owner_dashboard() to authenticated;
grant execute on function public.sales_report(date, date) to authenticated;
grant execute on function public.set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.update_business_settings(text, text, text, text, text, text, integer)
  to authenticated;
grant execute on function public.staff_reset_precheck(uuid, uuid) to service_role;
grant execute on function public.owner_precheck(uuid) to service_role;
grant execute on function public.set_business_logo(uuid, text) to service_role;
