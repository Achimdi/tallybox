-- pgTAP: new database objects are closed to the browser roles by default.
-- Run with `npm run db:test` (needs Docker, so normally this runs in CI).

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- Create throwaway objects the same way a migration would. Rolled back at the end.
create function public._tb_probe_fn() returns int language sql as 'select 1';
create table public._tb_probe_table (id int primary key);

select ok(
  not has_function_privilege('anon', 'public._tb_probe_fn()', 'execute'),
  'anon cannot run a new function by default'
);
select ok(
  not has_function_privilege('authenticated', 'public._tb_probe_fn()', 'execute'),
  'authenticated cannot run a new function by default'
);
select ok(
  has_function_privilege('service_role', 'public._tb_probe_fn()', 'execute'),
  'service_role (server only) can run a new function'
);

select ok(
  not has_table_privilege('anon', 'public._tb_probe_table', 'select'),
  'anon cannot read a new table by default'
);
select ok(
  not has_table_privilege('authenticated', 'public._tb_probe_table', 'select'),
  'authenticated cannot read a new table by default'
);
select ok(
  not has_table_privilege('authenticated', 'public._tb_probe_table', 'insert'),
  'authenticated cannot insert into a new table'
);
select ok(
  not has_table_privilege('authenticated', 'public._tb_probe_table', 'update'),
  'authenticated cannot update a new table'
);
select ok(
  not has_table_privilege('authenticated', 'public._tb_probe_table', 'delete'),
  'authenticated cannot delete from a new table'
);
select ok(
  has_table_privilege('service_role', 'public._tb_probe_table', 'select'),
  'service_role (server only) can read a new table'
);

select * from finish();

rollback;
