-- Test helpers shared by every test file. This file sorts first, so it runs first.
-- Unlike the other test files it COMMITS, so the helpers stay for the rest of the run.
-- It only ever runs against a throwaway test database (local or CI), never a real project.

begin;

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Creates a Supabase Auth user the way the Auth admin API would.
create or replace function tests.create_user(
  p_email text,
  p_app_metadata jsonb default '{}'::jsonb,
  p_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth.users (id, email, raw_app_meta_data)
  values (p_id, lower(p_email), p_app_metadata);
  return p_id;
end;
$$;

-- Sets what the Auth admin API would set on a user (role and business_id).
create or replace function tests.set_app_metadata(p_user_id uuid, p_app_metadata jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update auth.users set raw_app_meta_data = p_app_metadata where id = p_user_id;
$$;

-- The JWT claims Supabase would put in a signed-in user's token.
create or replace function tests.claims_for(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sub', u.id,
    'role', 'authenticated',
    'email', u.email,
    'app_metadata', u.raw_app_meta_data
  )
  from auth.users u
  where u.id = p_user_id;
$$;

-- Act as a signed-in user, exactly as a request from the browser would.
create or replace function tests.authenticate_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', tests.claims_for(p_user_id)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Act as a signed-in user whose token carries different claims than the database has
-- (a stale or tampered-looking token).
create or replace function tests.authenticate_with_claims(p_user_id uuid, p_app_metadata jsonb)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated', 'app_metadata', p_app_metadata)::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Act as a visitor who is not signed in.
create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Act as an Edge Function using the secret key.
create or replace function tests.authenticate_as_service_role()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- Back to the test runner's own role.
create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Tests switch to the browser roles and still need pgTAP's own functions
-- (ok, is, throws_ok...). The baseline migration stops new functions being
-- runnable by everyone, which includes pgTAP's, so open them here.
grant execute on all functions in schema extensions to anon, authenticated, service_role;

select plan(1);
select pass('test helpers installed');
select * from finish();

commit;
