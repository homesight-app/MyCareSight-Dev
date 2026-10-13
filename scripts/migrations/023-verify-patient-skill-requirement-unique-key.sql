-- Read-only verification for migration 023. Expect every boolean to be true
-- and every *_count value to be zero.
WITH schema_state AS (
  SELECT EXISTS (
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
  ) AS one_requirement_per_patient_key_ok
), integrity AS (
  SELECT
    (
      SELECT count(*)::integer
      FROM (
        SELECT patient_id
        FROM public.patient_skill_requirements
        GROUP BY patient_id
        HAVING count(*) > 1
      ) duplicates
    ) AS duplicate_patient_count,
    (
      SELECT count(*)::integer
      FROM public.patient_skill_requirements requirement
      JOIN public.patients patient ON patient.id = requirement.patient_id
      WHERE patient.agency_id IS DISTINCT FROM requirement.agency_id
    ) AS agency_mismatch_count
)
SELECT *
FROM schema_state
CROSS JOIN integrity;
