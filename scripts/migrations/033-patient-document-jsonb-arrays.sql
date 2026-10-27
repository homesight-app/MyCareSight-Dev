-- 033: Repair patient document metadata encoded as a JSONB string containing an array.
-- Neon only. Preserves every document entry and changes no blob objects.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $repair$
DECLARE
  patient_row RECORD;
  decoded jsonb;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '033 must not run against Supabase';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients'
      AND column_name = 'documents' AND data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION '033 requires public.patients.documents to be jsonb';
  END IF;

  FOR patient_row IN
    SELECT id, documents
    FROM public.patients
    WHERE jsonb_typeof(documents) = 'string'
    FOR UPDATE
  LOOP
    BEGIN
      decoded := (patient_row.documents #>> '{}')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION '033 found a patient document string that is not valid JSON';
    END;
    IF jsonb_typeof(decoded) <> 'array' THEN
      RAISE EXCEPTION '033 found a patient document string that does not contain an array';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(decoded) AS entry(document)
      WHERE jsonb_typeof(entry.document) IS DISTINCT FROM 'object'
        OR jsonb_typeof(entry.document -> 'id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(entry.document -> 'path') IS DISTINCT FROM 'string'
    ) THEN
      RAISE EXCEPTION '033 found an encoded document array with invalid entries';
    END IF;
    UPDATE public.patients
    SET documents = decoded
    WHERE id = patient_row.id;
  END LOOP;
END
$repair$;

COMMIT;
