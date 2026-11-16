-- Phase 2A: access periods.
--
-- v1 has no payments and no paywall. The super-admin grants each business a
-- time-limited access period by hand:
--   - an activation code carries an access length (in days, or open-ended);
--   - registering sets the business's access end date from that length;
--   - after the end date there is a short grace period, then the business is
--     locked ("access ended") until the super-admin extends it. Nothing is deleted.
--
-- The rule lives in ONE place, private.business_access_state(), which Row Level
-- Security and every function already go through. The same rule is written in
-- web/src/domain/access.ts; the two must stay in step.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.activation_codes
  add column access_days integer
    check (access_days is null or access_days between 1 and 3650);

comment on column public.activation_codes.access_days is
  'Access length the business gets when it registers with this code. Null means open-ended.';

comment on column public.businesses.subscription_ends_at is
  'End of the granted access period. Null means open-ended. After it, plus the grace period, the business is locked.';

-- ---------------------------------------------------------------------------
-- The access rule
-- ---------------------------------------------------------------------------

-- After the access end date, the business keeps working this many more days.
create function private.access_grace_days() returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

-- The owner is warned, and the super-admin sees "ending soon", this many days ahead.
create function private.access_warning_days() returns integer
language sql
immutable
set search_path = ''
as $$ select 7 $$;

-- THE one place that decides whether a business may use Tallybox.
--   'ok'        the business may use the app
--   'suspended' the super-admin suspended it (manual)
--   'ended'     its access period, plus the grace period, has run out (automatic)
-- Later, payment status is added HERE and nowhere else.
create or replace function private.business_access_state(p_business_id uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when b.status = 'suspended' then 'suspended'
    when b.subscription_ends_at is not null
      and now() >= b.subscription_ends_at + make_interval(days => private.access_grace_days())
      then 'ended'
    else 'ok'
  end
  from public.businesses b
  where b.id = p_business_id
$$;

-- For the super-admin's filters, whatever the suspension status:
--   'ended'        past the end date and the grace period
--   'ending_soon'  ends within the warning window (or is in its grace period)
--   'ok'           everything else, including open-ended access
create function private.access_filter(p_ends_at timestamptz) returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_ends_at is null then 'ok'
    when now() >= p_ends_at + make_interval(days => private.access_grace_days()) then 'ended'
    -- Whole days left, rounded up, like the app's banner.
    when ceil(extract(epoch from (p_ends_at - now())) / 86400.0) <= private.access_warning_days()
      then 'ending_soon'
    else 'ok'
  end
$$;

-- ---------------------------------------------------------------------------
-- Session state: now also says when access ends
-- ---------------------------------------------------------------------------

create or replace function public.get_session_state(p_record_login boolean default false) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_business public.businesses%rowtype;
  v_access text;
begin
  if v_user_id is null then
    perform private.fail('unauthenticated');
  end if;

  if private.user_is_super_admin(v_user_id) then
    return jsonb_build_object('kind', 'super_admin', 'user_id', v_user_id);
  end if;

  select * into v_profile from public.profiles p where p.id = v_user_id;
  if not found then
    return jsonb_build_object('kind', 'none', 'user_id', v_user_id);
  end if;

  select * into v_business from public.businesses b where b.id = v_profile.business_id;
  v_access := private.business_access_state(v_business.id);

  if p_record_login and v_profile.active and v_access = 'ok' then
    update public.profiles set last_login_at = now() where id = v_user_id;
  end if;

  return jsonb_build_object(
    'kind', 'member',
    'user_id', v_user_id,
    'role', v_profile.role,
    'display_name', v_profile.display_name,
    'username', v_profile.username,
    'active', v_profile.active,
    -- 'ok', 'suspended' or 'ended'
    'access', v_access,
    'business', jsonb_build_object(
      'id', v_business.id,
      'name', v_business.name,
      'business_code', v_business.business_code,
      'currency_code', v_business.currency_code,
      'timezone', v_business.timezone,
      'access_ends_at', v_business.subscription_ends_at
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Super-admin reads
-- ---------------------------------------------------------------------------

drop function public.admin_list_businesses();

create function public.admin_list_businesses()
returns table (
  id uuid,
  name text,
  business_code text,
  status text,
  access_ends_at timestamptz,
  -- 'ok', 'ending_soon' or 'ended'
  access_filter text,
  created_at timestamptz,
  owner_name text,
  owner_email text,
  staff_count bigint,
  last_activity_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin((select auth.uid()));
  return query
    select
      b.id,
      b.name,
      b.business_code,
      b.status,
      b.subscription_ends_at,
      private.access_filter(b.subscription_ends_at),
      b.created_at,
      (select p.display_name from public.profiles p where p.id = b.owner_id),
      u.email::text,
      (select count(*) from public.profiles p where p.business_id = b.id and p.role = 'staff'),
      (select max(p.last_login_at) from public.profiles p where p.business_id = b.id),
      b.suspended_at,
      b.suspended_reason
    from public.businesses b
    left join auth.users u on u.id = b.owner_id
    order by b.created_at desc;
end;
$$;

grant execute on function public.admin_list_businesses() to authenticated;

-- One business in detail. Order counts are added when orders exist (Phase 2C).
create function public.admin_get_business(p_business_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_super_admin((select auth.uid()));

  select jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'business_code', b.business_code,
    'status', b.status,
    'access_ends_at', b.subscription_ends_at,
    'access_filter', private.access_filter(b.subscription_ends_at),
    'created_at', b.created_at,
    'owner_name', (select p.display_name from public.profiles p where p.id = b.owner_id),
    'owner_email', (select u.email::text from auth.users u where u.id = b.owner_id),
    'staff_count',
      (select count(*) from public.profiles p where p.business_id = b.id and p.role = 'staff'),
    'active_staff_count',
      (select count(*) from public.profiles p
       where p.business_id = b.id and p.role = 'staff' and p.active),
    'last_activity_at',
      (select max(p.last_login_at) from public.profiles p where p.business_id = b.id),
    'suspended_at', b.suspended_at,
    'suspended_reason', b.suspended_reason,
    'phone', b.phone,
    'timezone', b.timezone,
    'currency_code', b.currency_code,
    'order_count', 0,
    'order_count_today', 0
  )
  into v_result
  from public.businesses b
  where b.id = p_business_id;

  if v_result is null then
    perform private.fail('not_found');
  end if;
  return v_result;
end;
$$;

grant execute on function public.admin_get_business(uuid) to authenticated;

drop function public.admin_list_activation_codes();

create function public.admin_list_activation_codes()
returns table (
  id uuid,
  owner_email text,
  note text,
  -- 'unused', 'used', 'revoked' or 'expired'
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  -- Null means open-ended.
  access_days integer,
  used_at timestamptz,
  used_by_business_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin((select auth.uid()));
  return query
    select
      c.id,
      c.owner_email,
      c.note,
      case when c.status = 'unused' and c.expires_at <= now() then 'expired' else c.status end,
      c.created_at,
      c.expires_at,
      c.access_days,
      c.used_at,
      b.name
    from public.activation_codes c
    left join public.businesses b on b.id = c.used_by_business_id
    order by c.created_at desc
    limit 200;
end;
$$;

grant execute on function public.admin_list_activation_codes() to authenticated;

create or replace function public.admin_platform_counts() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin((select auth.uid()));
  return jsonb_build_object(
    'businesses', (select count(*) from public.businesses),
    'suspended', (select count(*) from public.businesses b where b.status = 'suspended'),
    'ending_soon', (
      select count(*) from public.businesses b
      where private.access_filter(b.subscription_ends_at) = 'ending_soon'
    ),
    'access_ended', (
      select count(*) from public.businesses b
      where private.access_filter(b.subscription_ends_at) = 'ended'
    ),
    'staff', (select count(*) from public.profiles p where p.role = 'staff'),
    'unused_codes', (
      select count(*) from public.activation_codes c
      where c.status = 'unused' and c.expires_at > now()
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Registration: the code's access length becomes the business's access period
-- ---------------------------------------------------------------------------

create or replace function public.register_business(
  p_business_id uuid,
  p_owner_id uuid,
  p_owner_email text,
  p_owner_name text,
  p_business_name text,
  p_business_code text,
  p_phone text,
  p_timezone text,
  p_activation_code text
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code_id uuid;
  v_access_days integer;
  v_problem text;
  v_business_code text := lower(trim(coalesce(p_business_code, '')));
  v_business_name text := trim(coalesce(p_business_name, ''));
  v_owner_name text := trim(coalesce(p_owner_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_constraint text;
begin
  -- Lock the code row so two registrations cannot use the same code at once.
  select c.id, c.access_days into v_code_id, v_access_days
  from public.activation_codes c
  where c.code_hash = private.hash_activation_code(p_activation_code)
  for update;

  v_problem := private.activation_code_problem(p_activation_code, p_owner_email);
  if v_problem <> 'ok' then
    perform private.fail(v_problem);
  end if;

  if not private.is_valid_business_code(v_business_code) then
    perform private.fail('business_code_invalid');
  end if;
  if exists (select 1 from public.businesses b where b.business_code = v_business_code) then
    perform private.fail('business_code_taken');
  end if;
  if char_length(v_business_name) not between 2 and 80
    or char_length(v_owner_name) not between 1 and 80
    or char_length(coalesce(v_phone, '')) > 30 then
    perform private.fail('validation');
  end if;

  insert into public.businesses (
    id, name, business_code, owner_id, phone, timezone, subscription_ends_at
  )
  values (
    p_business_id,
    v_business_name,
    v_business_code,
    p_owner_id,
    v_phone,
    -- The browser suggests its own timezone. Anything Postgres does not know becomes UTC.
    coalesce((select t.name from pg_catalog.pg_timezone_names t where t.name = p_timezone), 'UTC'),
    -- Access starts counting from the day of registration. Null days: open-ended.
    case
      when v_access_days is null then null
      else now() + make_interval(days => v_access_days)
    end
  );

  insert into public.profiles (id, business_id, role, username, display_name, created_by)
  values (p_owner_id, p_business_id, 'owner', null, v_owner_name, p_owner_id);

  update public.activation_codes
  set status = 'used', used_at = now(), used_by_business_id = p_business_id
  where id = v_code_id;

  return p_business_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'businesses_business_code_key' then
      -- Two people asked for the same code at the same moment.
      perform private.fail('business_code_taken');
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- Super-admin actions (called by Edge Functions with the service role)
-- ---------------------------------------------------------------------------

drop function public.admin_generate_activation_code(uuid, text, text, integer);

-- p_access_days: how long the business may use Tallybox once registered.
-- Pass null for open-ended access. Left out, it is 30 days, like the app's default.
create function public.admin_generate_activation_code(
  p_actor_id uuid,
  p_owner_email text,
  p_note text default null,
  p_expires_in_days integer default 7,
  p_access_days integer default 30
)
returns table (
  id uuid,
  code text,
  owner_email text,
  expires_at timestamptz,
  access_days integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_owner_email, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_days integer := coalesce(p_expires_in_days, 7);
  v_code text;
  v_id uuid;
  v_expires timestamptz;
begin
  perform private.require_super_admin(p_actor_id);

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254
    or v_days not between 1 and 90
    or (p_access_days is not null and p_access_days not between 1 and 3650)
    or char_length(coalesce(v_note, '')) > 200 then
    perform private.fail('validation');
  end if;

  v_expires := now() + make_interval(days => v_days);

  -- A clash is practically impossible (about one in a trillion), but try again if it happens.
  for attempt in 1..5 loop
    v_code := private.new_activation_code();
    begin
      insert into public.activation_codes as c
        (code_hash, owner_email, note, expires_at, access_days, created_by)
      values
        (private.hash_activation_code(v_code), v_email, v_note, v_expires, p_access_days, p_actor_id)
      returning c.id into v_id;
      exit;
    exception
      when unique_violation then
        v_id := null;
    end;
  end loop;

  if v_id is null then
    perform private.fail('server');
  end if;

  -- The only time the code itself leaves the database.
  return query select v_id, v_code, v_email, v_expires, p_access_days;
end;
$$;

grant execute on function public.admin_generate_activation_code(uuid, text, text, integer, integer)
  to service_role;

-- Extends a business's access. Days are added from the later of now and the
-- current end date, so extending early never loses days and extending after it
-- ended starts from today. Null days makes access open-ended.
create function public.admin_extend_access(
  p_actor_id uuid,
  p_business_id uuid,
  p_days integer
) returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current timestamptz;
  v_new timestamptz;
begin
  perform private.require_super_admin(p_actor_id);

  if p_days is not null and p_days not between 1 and 3650 then
    perform private.fail('validation');
  end if;

  select b.subscription_ends_at into v_current
  from public.businesses b
  where b.id = p_business_id
  for update;

  if not found then
    perform private.fail('not_found');
  end if;

  v_new := case
    when p_days is null then null
    else greatest(now(), coalesce(v_current, now())) + make_interval(days => p_days)
  end;

  update public.businesses set subscription_ends_at = v_new where id = p_business_id;
  return v_new;
end;
$$;

grant execute on function public.admin_extend_access(uuid, uuid, integer) to service_role;

-- The owner's email for a password-reset link. The Edge Function then asks
-- Supabase Auth for a one-time recovery link, which the super-admin sends by hand.
create function public.admin_owner_email(p_actor_id uuid, p_business_id uuid) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  perform private.require_super_admin(p_actor_id);

  select u.email::text into v_email
  from public.businesses b
  join auth.users u on u.id = b.owner_id
  where b.id = p_business_id;

  if v_email is null then
    perform private.fail('not_found');
  end if;
  return v_email;
end;
$$;

grant execute on function public.admin_owner_email(uuid, uuid) to service_role;

-- Owner-only actions say which block applies, so the app can show the right
-- screen: 'business_suspended' or 'access_ended'.
create or replace function private.require_owner(p_user_id uuid) returns uuid
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
  if v_profile.role <> 'owner' then
    perform private.fail('permission_denied');
  end if;
  return v_profile.business_id;
end;
$$;
