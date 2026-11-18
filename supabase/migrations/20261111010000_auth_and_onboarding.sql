-- Businesses, profiles, activation codes, and who may see what.
--
-- How access works, in plain words:
--   * The browser can only READ, and only rows that Row Level Security allows.
--   * Every change goes through a function in this file. Functions that create
--     accounts or act for the super-admin can only be run by Edge Functions
--     (the service_role), never straight from the browser.
--   * Whether someone may see a business's data is decided LIVE on every query:
--     their profile must be active and the business must have access. A token
--     that was issued before a suspension is therefore useless at once.

-- ---------------------------------------------------------------------------
-- A private schema for helpers. It is not exposed through the API.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Stops with a short machine-readable code. Edge Functions and the app turn the
-- code into a friendly message. Raw database errors are never shown to people.
create function private.fail(p_code text) returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  -- Lowercase letters, digits and hyphens, 3 to 20 characters, no hyphen at either end.
  business_code text not null unique
    check (business_code ~ '^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$'),
  -- 'suspended' is a manual action by the super-admin.
  status text not null default 'active' check (status in ('active', 'suspended')),
  owner_id uuid references auth.users (id) on delete set null,

  -- Reserved for later billing. v1: every business is 'comped' and nothing is limited.
  plan text not null default 'standard',
  subscription_status text not null default 'comped'
    check (subscription_status in ('comped', 'trial', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  subscription_ends_at timestamptz,

  -- Settings
  currency_code text not null default 'NGN' check (currency_code ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  address text check (char_length(address) <= 200),
  phone text check (char_length(phone) <= 30),
  logo_path text,
  receipt_footer text check (char_length(receipt_footer) <= 200),
  default_low_stock_level integer not null default 5 check (default_low_stock_level >= 0),

  order_counter bigint not null default 0 check (order_counter >= 0),
  created_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspended_reason text check (char_length(suspended_reason) <= 500)
);

comment on table public.businesses is
  'One row per business (tenant). Every other tenant table points here with business_id.';

create table public.profiles (
  -- Same id as the Supabase Auth user.
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete restrict,
  -- The super-admin has no profile: that role lives only in the Auth user's app_metadata.
  role text not null check (role in ('owner', 'staff')),
  -- Staff sign in with a username. Owners sign in with their email, so theirs is null.
  username text check (username ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' and char_length(username) between 3 and 20),
  display_name text not null check (char_length(display_name) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  last_login_at timestamptz,
  unique (business_id, username),
  check ((role = 'staff') = (username is not null))
);

comment on table public.profiles is
  'Mirror of each Auth user''s role and business. One owner per business in v1.';

create unique index profiles_one_owner_per_business on public.profiles (business_id) where role = 'owner';
create index profiles_business_id_idx on public.profiles (business_id);

-- Platform level: no browser access at all, only through functions.
create table public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  -- Only a hash is stored. The code itself is shown once, when it is created.
  code_hash text not null unique,
  owner_email text not null check (owner_email = lower(owner_email)),
  note text check (char_length(note) <= 200),
  -- 'expired' is not stored: an unused code past expires_at is expired.
  status text not null default 'unused' check (status in ('unused', 'used', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_business_id uuid references public.businesses (id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null
);

create index activation_codes_created_at_idx on public.activation_codes (created_at desc);

create table public.rate_limits (
  -- A hash of "what:who", for example a hashed "register:ip:1.2.3.4". No personal data.
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

-- THE one place that decides whether a business may use Tallybox.
--   'ok'        the business may use the app
--   'suspended' the super-admin suspended it (manual)
--   'lapsed'    reserved: a subscription ran out (automatic, later)
-- Later, subscription and grace-period rules are added HERE and nowhere else.
create function private.business_access_state(p_business_id uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when b.status = 'suspended' then 'suspended'
    else 'ok'
  end
  from public.businesses b
  where b.id = p_business_id
$$;

-- Row Level Security policies and every server function call this, never
-- "status = 'active'" directly.
create function private.business_has_access(p_business_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.business_access_state(p_business_id) = 'ok', false)
$$;

-- The business of the signed-in user, or null if they may not use it right now.
-- Null when: not signed in, no profile, profile turned off, business without
-- access, or a token whose business does not match the database.
create function private.my_business_id() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.business_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active
    and p.business_id::text = ((select auth.jwt()) -> 'app_metadata' ->> 'business_id')
    and private.business_has_access(p.business_id)
$$;

-- 'owner' or 'staff' for the signed-in user, under the same conditions as above.
create function private.my_role() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.business_id = private.my_business_id()
$$;

-- Is this Auth user the super-admin? Read live from the Auth user itself,
-- which only the service role can change, so an old token proves nothing.
create function private.user_is_super_admin(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and u.raw_app_meta_data ->> 'role' = 'super_admin'
  )
$$;

create function private.require_super_admin(p_user_id uuid) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not private.user_is_super_admin(p_user_id) then
    -- Same answer as for something that does not exist: the admin area is hidden.
    perform private.fail('not_found');
  end if;
end;
$$;

-- Only the two helpers that policies use are open to signed-in users.
grant execute on function private.my_business_id() to authenticated;
grant execute on function private.my_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: deny by default, read-only, own business only
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.activation_codes enable row level security;
alter table public.rate_limits enable row level security;

-- Read access only. There are NO insert, update or delete policies and no such
-- grants: the browser cannot write to any table.
grant select on public.businesses to authenticated;
grant select on public.profiles to authenticated;

create policy "Members can read their own business"
  on public.businesses for select to authenticated
  using (id = (select private.my_business_id()));

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    and business_id = (select private.my_business_id())
  );

create policy "Owners can read profiles in their business"
  on public.profiles for select to authenticated
  using (
    business_id = (select private.my_business_id())
    and (select private.my_role()) = 'owner'
  );

-- activation_codes and rate_limits have no policies and no grants at all.

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------

create function private.is_valid_business_code(p_code text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_code is not null
    and p_code ~ '^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$'
    and p_code !~ '--'
    -- Reserved so nobody can pose as Tallybox or clash with future addresses.
    and p_code not in (
      'admin', 'api', 'app', 'www', 'tallybox', 'support', 'help', 'staff', 'owner',
      'login', 'register', 'billing', 'system', 'root', 'test', 'demo'
    )
$$;

create function private.is_valid_username(p_username text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_username is not null
    and char_length(p_username) between 3 and 20
    and p_username ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
$$;

-- Codes are compared without spaces, hyphens or letter case, so "tb-7k4m-x9qd"
-- and "TB7K4MX9QD" are the same code.
create function private.hash_activation_code(p_code text) returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')),
    'hex'
  )
$$;

-- A new code like TB-7K4M-X9QD. The alphabet has no 0, O, 1 or I, so codes are
-- easy to read aloud and type. Randomness comes from gen_random_uuid(), which
-- uses the operating system's cryptographic generator. Only fully random bytes
-- of the UUID are used (the version and variant bytes are skipped), and 256 is
-- an exact multiple of 32, so every character is equally likely.
create function private.new_activation_code() returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  c_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  c_positions constant integer[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_chars text := '';
  v_position integer;
begin
  foreach v_position in array c_positions loop
    v_chars := v_chars || substr(c_alphabet, (get_byte(v_bytes, v_position) % 32) + 1, 1);
  end loop;
  return 'TB-' || substr(v_chars, 1, 4) || '-' || substr(v_chars, 5, 4);
end;
$$;

-- What is wrong with this code for this email, or 'ok'.
-- A code that does not exist and a code made for a different email give the
-- same answer, so nobody can use this to discover which codes exist.
create function private.activation_code_problem(p_code text, p_email text) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when c.owner_email <> lower(trim(coalesce(p_email, ''))) then 'activation_code_invalid'
        when c.status = 'used' then 'activation_code_used'
        when c.status = 'revoked' then 'activation_code_revoked'
        when c.expires_at <= now() then 'activation_code_expired'
        else 'ok'
      end
      from public.activation_codes c
      where c.code_hash = private.hash_activation_code(p_code)
    ),
    'activation_code_invalid'
  )
$$;

-- ---------------------------------------------------------------------------
-- Functions for signed-in users (called straight from the browser)
-- ---------------------------------------------------------------------------

-- Who am I, and may I use the app right now? The app calls this on start and
-- whenever the tab regains focus. It answers even for a suspended business or a
-- turned-off account (Row Level Security hides everything from those), so the
-- app can show the right screen and sign the person out.
create function public.get_session_state(p_record_login boolean default false) returns jsonb
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
    'access', v_access,
    'business', jsonb_build_object(
      'id', v_business.id,
      'name', v_business.name,
      'business_code', v_business.business_code,
      'currency_code', v_business.currency_code,
      'timezone', v_business.timezone
    )
  );
end;
$$;

grant execute on function public.get_session_state(boolean) to authenticated;

-- Super-admin reads. Open to signed-in users at the API level, but each one
-- checks live that the caller is the super-admin and otherwise answers 'not_found'.

create function public.admin_list_businesses()
returns table (
  id uuid,
  name text,
  business_code text,
  status text,
  created_at timestamptz,
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
      b.created_at,
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

create function public.admin_list_activation_codes()
returns table (
  id uuid,
  owner_email text,
  note text,
  -- 'unused', 'used', 'revoked' or 'expired'
  status text,
  created_at timestamptz,
  expires_at timestamptz,
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
      c.used_at,
      b.name
    from public.activation_codes c
    left join public.businesses b on b.id = c.used_by_business_id
    order by c.created_at desc
    limit 200;
end;
$$;

grant execute on function public.admin_list_activation_codes() to authenticated;

create function public.admin_platform_counts() returns jsonb
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
    'staff', (select count(*) from public.profiles p where p.role = 'staff'),
    'unused_codes', (
      select count(*) from public.activation_codes c
      where c.status = 'unused' and c.expires_at > now()
    )
  );
end;
$$;

grant execute on function public.admin_platform_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- Functions for Edge Functions only (service_role). The browser cannot run these.
-- ---------------------------------------------------------------------------

-- Counts one attempt and says whether it is still within the limit.
-- A fixed window: at most p_max attempts per p_window_seconds for a key.
create function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Tidy old rows now and then, so the table stays small without a scheduled job.
  if random() < 0.02 then
    delete from public.rate_limits r where r.window_start < now() - interval '2 days';
  end if;

  return v_count <= p_max;
end;
$$;

grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

create function public.business_code_available(p_code text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_valid_business_code(lower(trim(coalesce(p_code, ''))))
    and not exists (
      select 1 from public.businesses b where b.business_code = lower(trim(p_code))
    )
$$;

grant execute on function public.business_code_available(text) to service_role;

-- Checked before the owner's Auth user is created, so a bad code creates nothing.
create function public.validate_activation_code(p_code text, p_email text) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.activation_code_problem(p_code, p_email)
$$;

grant execute on function public.validate_activation_code(text, text) to service_role;

-- Creates the business, the owner's profile and marks the code used, all in one
-- transaction. The Edge Function creates the Auth user first and removes it
-- again if this fails, so nothing is ever half-created.
create function public.register_business(
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
  v_problem text;
  v_business_code text := lower(trim(coalesce(p_business_code, '')));
  v_business_name text := trim(coalesce(p_business_name, ''));
  v_owner_name text := trim(coalesce(p_owner_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_constraint text;
begin
  -- Lock the code row so two registrations cannot use the same code at once.
  select c.id into v_code_id
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

  insert into public.businesses (id, name, business_code, owner_id, phone, timezone)
  values (
    p_business_id,
    v_business_name,
    v_business_code,
    p_owner_id,
    v_phone,
    -- The browser suggests its own timezone. Anything Postgres does not know becomes UTC.
    coalesce((select t.name from pg_catalog.pg_timezone_names t where t.name = p_timezone), 'UTC')
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

grant execute on function public.register_business(uuid, uuid, text, text, text, text, text, text, text)
  to service_role;

-- Who is calling an Edge Function, read live (never trusted from the token).
create function public.get_actor(p_user_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.user_is_super_admin(p_user_id) then
      jsonb_build_object('kind', 'super_admin', 'user_id', p_user_id)
    else coalesce(
      (
        select jsonb_build_object(
          'kind', 'member',
          'user_id', p.id,
          'role', p.role,
          'active', p.active,
          'business_id', p.business_id,
          'business_code', b.business_code,
          'has_access', private.business_has_access(p.business_id)
        )
        from public.profiles p
        join public.businesses b on b.id = p.business_id
        where p.id = p_user_id
      ),
      jsonb_build_object('kind', 'none', 'user_id', p_user_id)
    )
  end
$$;

grant execute on function public.get_actor(uuid) to service_role;

-- Stops unless p_user_id is an active owner of a business that has access.
-- Returns that business's id.
create function private.require_owner(p_user_id uuid) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if not found then
    perform private.fail('permission_denied');
  end if;
  if not v_profile.active then
    perform private.fail('account_disabled');
  end if;
  if not private.business_has_access(v_profile.business_id) then
    perform private.fail('business_suspended');
  end if;
  if v_profile.role <> 'owner' then
    perform private.fail('permission_denied');
  end if;
  return v_profile.business_id;
end;
$$;

-- Checked before a staff member's Auth user is created. Returns what the Edge
-- Function needs to build the sign-in address.
create function public.staff_precheck(p_owner_id uuid, p_username text) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner(p_owner_id);
  v_username text := lower(trim(coalesce(p_username, '')));
begin
  if not private.is_valid_username(v_username) then
    perform private.fail('username_invalid');
  end if;
  if exists (
    select 1 from public.profiles p
    where p.business_id = v_business_id and p.username = v_username
  ) then
    perform private.fail('username_taken');
  end if;
  return jsonb_build_object(
    'business_id', v_business_id,
    'business_code', (select b.business_code from public.businesses b where b.id = v_business_id),
    'username', v_username
  );
end;
$$;

grant execute on function public.staff_precheck(uuid, text) to service_role;

create function public.create_staff_profile(
  p_owner_id uuid,
  p_staff_user_id uuid,
  p_username text,
  p_display_name text
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner(p_owner_id);
  v_username text := lower(trim(coalesce(p_username, '')));
  v_display_name text := trim(coalesce(p_display_name, ''));
  v_constraint text;
begin
  if not private.is_valid_username(v_username) then
    perform private.fail('username_invalid');
  end if;
  if char_length(v_display_name) not between 1 and 80 then
    perform private.fail('validation');
  end if;

  insert into public.profiles (id, business_id, role, username, display_name, created_by)
  values (p_staff_user_id, v_business_id, 'staff', v_username, v_display_name, p_owner_id);

  return p_staff_user_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_business_id_username_key' then
      perform private.fail('username_taken');
    end if;
    raise;
end;
$$;

grant execute on function public.create_staff_profile(uuid, uuid, text, text) to service_role;

-- Super-admin actions. The Edge Function passes the caller's id, and each
-- function checks live that the caller really is the super-admin.

create function public.admin_generate_activation_code(
  p_actor_id uuid,
  p_owner_email text,
  p_note text default null,
  p_expires_in_days integer default 7
)
returns table (id uuid, code text, owner_email text, expires_at timestamptz)
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
    or char_length(coalesce(v_note, '')) > 200 then
    perform private.fail('validation');
  end if;

  v_expires := now() + make_interval(days => v_days);

  -- A clash is practically impossible (about one in a trillion), but try again if it happens.
  for attempt in 1..5 loop
    v_code := private.new_activation_code();
    begin
      insert into public.activation_codes as c (code_hash, owner_email, note, expires_at, created_by)
      values (private.hash_activation_code(v_code), v_email, v_note, v_expires, p_actor_id)
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
  return query select v_id, v_code, v_email, v_expires;
end;
$$;

grant execute on function public.admin_generate_activation_code(uuid, text, text, integer)
  to service_role;

create function public.admin_revoke_activation_code(p_actor_id uuid, p_code_id uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform private.require_super_admin(p_actor_id);

  select c.status into v_status
  from public.activation_codes c
  where c.id = p_code_id
  for update;

  if not found then
    perform private.fail('not_found');
  end if;
  -- Only a code that nobody has used yet can be revoked.
  if v_status <> 'unused' then
    perform private.fail('conflict');
  end if;

  update public.activation_codes
  set status = 'revoked', revoked_at = now()
  where id = p_code_id;
end;
$$;

grant execute on function public.admin_revoke_activation_code(uuid, uuid) to service_role;

create function public.admin_set_business_status(
  p_actor_id uuid,
  p_business_id uuid,
  p_status text,
  p_reason text default null
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform private.require_super_admin(p_actor_id);

  if p_status not in ('active', 'suspended') or char_length(coalesce(v_reason, '')) > 500 then
    perform private.fail('validation');
  end if;
  if p_status = 'suspended' and v_reason is null then
    -- A suspension always records why.
    perform private.fail('validation');
  end if;

  update public.businesses b
  set
    status = p_status,
    suspended_at = case when p_status = 'suspended' then now() else null end,
    suspended_reason = case when p_status = 'suspended' then v_reason else null end
  where b.id = p_business_id;

  if not found then
    perform private.fail('not_found');
  end if;

  if p_status = 'suspended' then
    -- Sign the business's users out. Row Level Security already refuses them
    -- from this moment, so this is tidying up: if the Auth tables cannot be
    -- touched from here, the suspension still holds.
    begin
      delete from auth.sessions s
      where s.user_id in (select p.id from public.profiles p where p.business_id = p_business_id);
    exception
      when insufficient_privilege or undefined_table then
        null;
    end;
  end if;
end;
$$;

grant execute on function public.admin_set_business_status(uuid, uuid, text, text) to service_role;
