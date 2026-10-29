-- Keep the Auth.js login identifier globally unique, independent of letter case.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_profiles
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce login email uniqueness: duplicate case-insensitive emails exist';
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_lower_unique
  ON public.user_profiles (lower(email));

COMMIT;
