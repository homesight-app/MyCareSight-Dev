-- Emergency rotation for the existing application runtime login.
-- Run separately on Neon Dev and UAT using a different generated password each time.
-- Replace the placeholder only in the Neon SQL editor; do not save the secret here.

BEGIN;

CREATE TEMP TABLE _mycaresight_runtime_rotation_secret (
  password text NOT NULL
) ON COMMIT DROP;

INSERT INTO _mycaresight_runtime_rotation_secret (password)
VALUES ('REPLACE_WITH_STRONG_PASSWORD');

DO $rotation$
DECLARE
  runtime_password text;
BEGIN
  SELECT password INTO runtime_password
  FROM _mycaresight_runtime_rotation_secret
  LIMIT 1;

  IF runtime_password = 'REPLACE_WITH_STRONG_PASSWORD' OR length(runtime_password) < 24 THEN
    RAISE EXCEPTION 'Replace the placeholder with a generated password of at least 24 characters.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin
  ) THEN
    RAISE EXCEPTION 'mycaresight_app login does not exist on this branch';
  END IF;

  EXECUTE format(
    'ALTER ROLE mycaresight_app PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
    runtime_password
  );
END
$rotation$;

COMMIT;

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
FROM pg_roles
WHERE rolname = 'mycaresight_app';
