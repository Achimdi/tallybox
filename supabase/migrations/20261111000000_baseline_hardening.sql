-- Tallybox baseline hardening.
--
-- Rule: the client reads, the server writes. Nothing in the database should be
-- reachable from the browser unless a later migration opens it on purpose.
--
-- By default Postgres lets everyone (PUBLIC) run any new function, and Supabase
-- gives the browser roles (anon, authenticated) access to new tables, sequences
-- and functions in the public schema. This migration turns those defaults off
-- for everything created from now on. Each later migration then grants exactly
-- what is needed (for example SELECT on a table that Row Level Security guards,
-- or EXECUTE on one RPC function).
--
-- service_role keeps its defaults: it is used only by Edge Functions on the server.

-- New functions: nobody can run them until a migration says who can.
alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- New tables and sequences: browser roles get nothing automatically.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
