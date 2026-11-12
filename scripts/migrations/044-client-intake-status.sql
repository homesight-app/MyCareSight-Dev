-- Add an explicit pre-service client lifecycle state for lead conversion.
-- The migration runner owns the surrounding transaction and ledger insert.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $migration$
DECLARE
  existing_constraint name;
  matching_constraint_count integer;
  status_attribute smallint;
BEGIN
  IF to_regclass('public.patients') IS NULL THEN
    RAISE EXCEPTION 'public.patients is required';
  END IF;

  SELECT attnum INTO status_attribute
  FROM pg_attribute
  WHERE attrelid = 'public.patients'::regclass
    AND attname = 'status'
    AND NOT attisdropped;
  IF status_attribute IS NULL THEN
    RAISE EXCEPTION 'public.patients.status is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.patients
    WHERE status IS NULL OR status NOT IN ('active', 'inactive', 'pending')
  ) THEN
    RAISE EXCEPTION 'patients contains unsupported status values';
  END IF;

  SELECT count(*), min(conname)
  INTO matching_constraint_count, existing_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.patients'::regclass
    AND contype = 'c'
    AND conkey = ARRAY[status_attribute]::smallint[]
    AND pg_get_constraintdef(oid) LIKE '%status%active%inactive%';

  IF matching_constraint_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one recognized patients.status constraint; found %', matching_constraint_count;
  END IF;

  EXECUTE format('ALTER TABLE public.patients DROP CONSTRAINT %I', existing_constraint);
  ALTER TABLE public.patients
    ADD CONSTRAINT patients_status_check
    CHECK (status IN ('active', 'inactive', 'pending')) NOT VALID;
  ALTER TABLE public.patients VALIDATE CONSTRAINT patients_status_check;
END
$migration$;

COMMENT ON COLUMN public.patients.status IS
  'Client lifecycle: pending is intake/pre-service; active and inactive retain their existing meanings.';
