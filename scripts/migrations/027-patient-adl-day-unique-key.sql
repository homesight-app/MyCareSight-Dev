-- 027: Restore the ADL/IADL day key required by the non-skilled plan save.
-- Neon-only. The live Supabase source has this index; the UAT Neon branch does not.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '027 must not run against Supabase';
  END IF;
  IF to_regclass('public.patient_care_plan_tasks') IS NULL THEN
    RAISE EXCEPTION '027 requires public.patient_care_plan_tasks';
  END IF;
  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_care_plan_tasks'
      AND column_name IN ('patient_id', 'legacy_task_code', 'day_of_week')
  ) <> 3 THEN
    RAISE EXCEPTION '027 requires the three ADL day key columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR current_user = 'mycaresight_app' THEN
    RAISE EXCEPTION '027 requires an independent migration owner and restricted runtime role';
  END IF;
END
$preflight$;

LOCK TABLE public.patient_care_plan_tasks IN SHARE ROW EXCLUSIVE MODE;

DO $duplicates$
DECLARE duplicate_group_count integer;
BEGIN
  SELECT count(*)::integer INTO duplicate_group_count
  FROM (
    SELECT patient_id, legacy_task_code, day_of_week
    FROM public.patient_care_plan_tasks
    WHERE legacy_task_code IS NOT NULL
    GROUP BY patient_id, legacy_task_code, day_of_week
    HAVING count(*) > 1
  ) duplicate_groups;
  IF duplicate_group_count > 0 THEN
    RAISE EXCEPTION '027 found % duplicate ADL day keys; reconcile before retrying', duplicate_group_count;
  END IF;
END
$duplicates$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_care_plan_tasks_patient_adl_dow
  ON public.patient_care_plan_tasks USING btree (patient_id, legacy_task_code, day_of_week);

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_record
    JOIN pg_class index_relation ON index_relation.oid = index_record.indexrelid
    WHERE index_record.indrelid = 'public.patient_care_plan_tasks'::regclass
      AND index_relation.relname = 'uq_patient_care_plan_tasks_patient_adl_dow'
      AND index_record.indisunique
      AND index_record.indisvalid
      AND index_record.indpred IS NULL
      AND index_record.indexprs IS NULL
      AND index_record.indnkeyatts = 3
      AND index_record.indnatts = 3
      AND index_record.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = index_record.indrelid AND attname = 'patient_id' AND NOT attisdropped
      )
      AND index_record.indkey[1] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = index_record.indrelid AND attname = 'legacy_task_code' AND NOT attisdropped
      )
      AND index_record.indkey[2] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = index_record.indrelid AND attname = 'day_of_week' AND NOT attisdropped
      )
  ) THEN
    RAISE EXCEPTION '027 ADL day index does not match the required key';
  END IF;
END
$verify$;

COMMIT;
