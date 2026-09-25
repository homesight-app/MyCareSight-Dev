-- Permit the reminder worker to read only the generated notification ID used by
-- INSERT ... RETURNING. No notification content becomes readable.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    RAISE EXCEPTION 'Missing prerequisite role mycaresight_jobs';
  END IF;
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite table public.notifications';
  END IF;
END
$preflight$;

REVOKE SELECT ON public.notifications FROM mycaresight_jobs;
GRANT SELECT (id) ON public.notifications TO mycaresight_jobs;

COMMIT;
