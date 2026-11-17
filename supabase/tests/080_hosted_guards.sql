-- pgTAP: functions keep to the rules the hosted project adds on top of Postgres.
--
-- Hosted Supabase refuses any DELETE or UPDATE without a WHERE clause on API
-- requests (the safeupdate guard), even inside functions. The local test
-- database doesn't have that guard, so this reads every function's source
-- instead. create_order once cleared its cart with a bare DELETE: it passed
-- here and failed on the real project.

begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

-- Each statement of each of our functions, with comments removed.
create temporary table fn_statements on commit drop as
select
  n.nspname || '.' || p.proname as fn,
  btrim(regexp_replace(s.stmt, '\s+', ' ', 'g')) as stmt
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral regexp_split_to_table(
  regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), ';'
) as s (stmt)
where n.nspname in ('public', 'private')
  and p.prolang in (select oid from pg_language where lanname in ('plpgsql', 'sql'));

select ok(
  exists (select 1 from fn_statements where stmt ~* 'delete from pg_temp\.cart where true'),
  'the check reads function sources (it finds the guarded cart clearing)'
);

select is(
  (
    select array_agg(distinct fn order by fn)
    from fn_statements
    where stmt ~* '(^|\s)(delete\s+from|update\s+[a-z0-9_."]+(\s+[a-z0-9_]+)?\s+set)\s'
      and stmt !~* '\mwhere\M'
  ),
  null,
  'no function deletes or updates rows without a WHERE clause'
);

select * from finish();

rollback;
