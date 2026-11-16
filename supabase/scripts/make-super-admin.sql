-- ONE-TIME SETUP: make your own account the Tallybox super-admin.
--
-- Run this once per Supabase project (dev, then prod), by hand, in the
-- Supabase dashboard: SQL Editor > New query. Nobody can become super-admin
-- through the app.
--
-- Before running:
--   1. Dashboard > Authentication > Users > Add user > Create new user.
--      Use your own email and a strong password, and tick "Auto Confirm User".
--   2. Replace YOUR-EMAIL@EXAMPLE.COM below with that email (keep the quotes).
--
-- What it does: sets app_metadata.role = 'super_admin' on that user. Only the
-- server can change app_metadata, so a user can never give themselves this role.
-- It refuses if the email is not found, or if the account already belongs to
-- a business (a business owner or staff member must not also be super-admin).

do $$
declare
  v_email constant text := lower('YOUR-EMAIL@EXAMPLE.COM');
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = v_email;

  if v_user_id is null then
    raise exception 'No user with email %. Create the user first (step 1).', v_email;
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'That account belongs to a business. Use a separate account for the super-admin.';
  end if;

  update auth.users
  set raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'business_id') || '{"role":"super_admin"}'::jsonb
  where id = v_user_id;

  raise notice 'Done: % is now the Tallybox super-admin. Sign in on the Owner login page.', v_email;
end;
$$;
