-- Read-only verification for migration 027. Expect key_ok=true and duplicate_groups=0.
SELECT
  EXISTS (
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
  ) AS key_ok,
  (
    SELECT count(*)::integer
    FROM (
      SELECT patient_id, legacy_task_code, day_of_week
      FROM public.patient_care_plan_tasks
      WHERE legacy_task_code IS NOT NULL
      GROUP BY patient_id, legacy_task_code, day_of_week
      HAVING count(*) > 1
    ) duplicate_keys
  ) AS duplicate_groups;
