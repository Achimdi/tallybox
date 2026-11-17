-- Phase 3A: findings from Supabase's security and performance advisors.
--
-- 1. New hosted projects come with public.rls_auto_enable(), the function
--    behind Supabase's "ensure_rls" event trigger (new tables get Row Level
--    Security automatically). It is SECURITY DEFINER and, created before our
--    migrations, executable by every role, signed in or not. It only works
--    inside the event trigger, but nobody should be able to call it through
--    the API. The event trigger itself keeps working: it runs as its owner.
--
-- 2. Held orders are listed by business, newest first, on every New order and
--    My orders screen. They had no index for that.

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

create index held_orders_business_idx on public.held_orders (business_id, updated_at desc);
