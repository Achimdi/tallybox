-- pgTAP: the standing security rules, checked against the whole schema.
-- These tests do not name individual tables, so every table and function added
-- in a later phase is covered automatically. If one of them fails after a new
-- migration, the migration opened something it should not have.

begin;

select plan(9);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  ),
  0,
  'every table in public has Row Level Security turned on'
);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['anon', 'authenticated']) as r (role_name)
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p (privilege)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and has_table_privilege(r.role_name, c.oid, p.privilege)
  ),
  0,
  'browser roles cannot insert, update, delete or truncate any table'
);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege('anon', c.oid, 'SELECT')
  ),
  0,
  'visitors who are not signed in cannot read any table'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
  0,
  'only read policies exist: there are no insert, update or delete policies'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public' and (roles && array['anon', 'public']::name[])
  ),
  0,
  'no policy applies to visitors who are not signed in'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'visitors who are not signed in cannot run any function'
);

-- The complete list of functions a signed-in user may call from the browser.
-- Adding a function here is a deliberate decision made in a migration.
select bag_eq(
  $$
    select p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  $$,
  array[
    'get_session_state',
    'admin_list_businesses',
    'admin_list_activation_codes',
    'admin_platform_counts',
    -- Phase 2: items and stock (each checks live that the caller is an owner)
    'upsert_item',
    'archive_item',
    'restore_item',
    'record_restock',
    'adjust_stock'
  ],
  'signed-in users can run only the functions meant for them'
);

select bag_eq(
  $$
    select p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  $$,
  array['my_business_id', 'my_role'],
  'of the private helpers, signed-in users can run only the two that policies use'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) as setting
        where setting like 'search_path=%'
      )
  ),
  0,
  'every SECURITY DEFINER function has a fixed search_path'
);

select * from finish();

rollback;
