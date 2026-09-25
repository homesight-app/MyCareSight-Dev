-- Create the dedicated Neon login used only by the Azure background-job service.
-- Run once per Neon branch as the branch owner before migration 016.
--
-- Replace the placeholder with a different generated password for each branch.
-- Never save the edited password or a resulting connection string in Git.

BEGIN;

CREATE TEMP TABLE _mycaresight_job_role_secret (
  password text NOT NULL
) ON COMMIT DROP;

INSERT INTO _mycaresight_job_role_secret (password)
VALUES ('REPLACE_WITH_STRONG_PASSWORD');

DO $role$
DECLARE
  job_password text;
BEGIN
  SELECT password INTO job_password
  FROM _mycaresight_job_role_secret
  LIMIT 1;

  IF job_password = 'REPLACE_WITH_STRONG_PASSWORD' OR length(job_password) < 24 THEN
    RAISE EXCEPTION 'Replace the placeholder with a generated password of at least 24 characters.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    EXECUTE format(
      'CREATE ROLE mycaresight_jobs LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
      job_password
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE mycaresight_jobs LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
      job_password
    );
  END IF;
END
$role$;

DO $database$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO mycaresight_jobs', current_database());
  EXECUTE format('ALTER ROLE mycaresight_jobs IN DATABASE %I SET statement_timeout = %L', current_database(), '5min');
  EXECUTE format('ALTER ROLE mycaresight_jobs IN DATABASE %I SET lock_timeout = %L', current_database(), '5s');
  EXECUTE format('GRANT mycaresight_jobs TO %I', current_user);
END
$database$;

GRANT USAGE ON SCHEMA public TO mycaresight_jobs;

COMMIT;

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
FROM pg_roles
WHERE rolname = 'mycaresight_jobs';
-- Expected: login=true; every privilege flag=false.
