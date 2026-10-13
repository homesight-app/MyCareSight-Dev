-- 023: Restore the one-row-per-client key required by caregiver-skill upserts.
-- Apply after 022. This repairs schema drift introduced when the Neon baseline
-- omitted the unique patient_id constraint from the authoritative source table.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE
  duplicate_patient_count integer;
  agency_mismatch_count integer;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '023 must not run against Supabase';
  END IF;
  IF to_regclass('public.patient_skill_requirements') IS NULL
     OR to_regclass('public.patients') IS NULL THEN
    RAISE EXCEPTION '023 requires the Neon client skill requirement tables';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_skill_requirements'
      AND column_name = 'preferred_skill_codes'
  ) THEN
    RAISE EXCEPTION 'Run migration 022 before migration 023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '023 requires an independent migration owner and restricted runtime role';
  END IF;

  SELECT count(*)::integer INTO duplicate_patient_count
  FROM (
    SELECT patient_id
    FROM public.patient_skill_requirements
    GROUP BY patient_id
    HAVING count(*) > 1
  ) duplicates;
  IF duplicate_patient_count > 0 THEN
    RAISE EXCEPTION
      '023 found % clients with duplicate patient_skill_requirements rows; reconcile them before retrying',
      duplicate_patient_count;
  END IF;

  SELECT count(*)::integer INTO agency_mismatch_count
  FROM public.patient_skill_requirements requirement
  JOIN public.patients patient ON patient.id = requirement.patient_id
  WHERE patient.agency_id IS DISTINCT FROM requirement.agency_id;
  IF agency_mismatch_count > 0 THEN
    RAISE EXCEPTION
      '023 found % patient_skill_requirements rows with a mismatched agency; reconcile them before retrying',
      agency_mismatch_count;
  END IF;
END
$preflight$;

LOCK TABLE public.patient_skill_requirements IN SHARE ROW EXCLUSIVE MODE;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    WHERE constraint_record.conrelid = 'public.patient_skill_requirements'::regclass
      AND constraint_record.contype = 'u'
      AND constraint_record.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute attribute
          WHERE attribute.attrelid = 'public.patient_skill_requirements'::regclass
            AND attribute.attname = 'patient_id'
            AND NOT attribute.attisdropped
        )
      ]::smallint[]
  ) THEN
    ALTER TABLE public.patient_skill_requirements
      ADD CONSTRAINT patient_skill_requirements_patient_key UNIQUE (patient_id);
  END IF;
END
$constraint$;

COMMIT;
