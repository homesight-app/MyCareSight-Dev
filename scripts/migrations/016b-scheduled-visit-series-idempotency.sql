-- Enforce the recurrence identity used by the refill worker. Standalone visits
-- remain unrestricted because NULL visit_series_id values are excluded.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('public.scheduled_visits') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite table public.scheduled_visits';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.scheduled_visits
    WHERE visit_series_id IS NOT NULL
    GROUP BY visit_series_id, visit_date
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate series/date visits must be reconciled before applying 016b';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_visits_series_date_unique
  ON public.scheduled_visits (visit_series_id, visit_date)
  WHERE visit_series_id IS NOT NULL;

COMMIT;
