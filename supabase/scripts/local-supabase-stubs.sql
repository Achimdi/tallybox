-- LOCAL TESTING ONLY. Never run this against a real Supabase project.
--
-- `npm run db:test:local` runs the migrations and pgTAP tests in an in-memory
-- Postgres (PGlite), so no Docker is needed. A real Supabase database comes
-- with roles, an `auth` schema and some default privileges. This file creates
-- minimal stand-ins for exactly the parts Tallybox relies on.
--
-- CI still runs the same tests against a real Supabase stack, which is the
-- final word. This is the fast local check.

-- Roles that Supabase provides.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- Schemas that Supabase provides.
create schema auth;
create schema extensions;

create schema storage;

-- The part of Supabase Storage that the migrations reference: buckets.
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


grant usage on schema public, extensions, auth to anon, authenticated, service_role;

-- The parts of Supabase Auth that the migrations reference.
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- Like the real table: no default for id (tests must give one).
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Supabase reads the signed-in user from the request's JWT claims.
create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select auth.jwt() ->> 'role'
$$;

-- Supabase's defaults for the public schema: browser roles get access to
-- everything new. The baseline hardening migration is what turns this off.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

-- New hosted projects also come with this function, behind Supabase's
-- "ensure_rls" event trigger. Created before our migrations, it starts out
-- executable by every role, as on the real project (see 20261117020000).
create function public.rls_auto_enable() returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
end;
$$;
