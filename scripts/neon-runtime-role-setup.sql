-- Phase 4.5 prerequisite: create the non-BYPASSRLS Neon runtime role.
--
-- Run this once from the Neon SQL editor as the database owner/admin role.
-- Before running, replace REPLACE_WITH_STRONG_PASSWORD with a generated secret,
-- then use this role's connection string for the app DATABASE_URL.
--
-- Important:
--   - Do not check the edited password into Git.
--   - The application must not use neondb_owner or any role with BYPASSRLS.
--   - This script grants broad app-runtime table privileges; app authorization
--     and table RLS policies remain the enforcement layers.

BEGIN;

CREATE TEMP TABLE _mycaresight_runtime_role_secret (
  password text NOT NULL
) ON COMMIT DROP;

INSERT INTO _mycaresight_runtime_role_secret (password)
VALUES ('BCec50^Ec1C%2R9vG@@GpKrh5G');

DO $$
DECLARE
  runtime_password text;
BEGIN
  SELECT password INTO runtime_password FROM _mycaresight_runtime_role_secret LIMIT 1;

  IF runtime_password = 'REPLACE_WITH_STRONG_PASSWORD' THEN
    RAISE EXCEPTION 'Replace REPLACE_WITH_STRONG_PASSWORD before running this script.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app') THEN
    EXECUTE format(
      'CREATE ROLE mycaresight_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
      runtime_password
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE mycaresight_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
      runtime_password
    );
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO mycaresight_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO mycaresight_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mycaresight_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO mycaresight_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO mycaresight_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mycaresight_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mycaresight_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO mycaresight_app;

-- Allows the SQL editor owner/admin session to run verification with
-- SET LOCAL ROLE mycaresight_app after RLS is enabled.
DO $$
BEGIN
  EXECUTE format('GRANT mycaresight_app TO %I', current_user);
END $$;

COMMIT;

-- Verification:
SELECT rolname, rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolname = 'mycaresight_app';
-- Expected: rolbypassrls = false, rolcanlogin = true.
