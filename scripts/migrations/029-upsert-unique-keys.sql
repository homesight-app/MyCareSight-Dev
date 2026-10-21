-- 029: Restore three source unique keys required by existing Neon upsert paths.
-- Neon-only. No application rows are inserted, updated, or deleted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '029 must not run against Supabase';
  END IF;
  IF to_regclass('public.agency_configurations') IS NULL
     OR to_regclass('public.agency_lead_stages') IS NULL
     OR to_regclass('public.patient_lead_details') IS NULL THEN
    RAISE EXCEPTION '029 requires all three target tables';
  END IF;
  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'agency_configurations' AND column_name = 'agency_id') OR
        (table_name = 'agency_lead_stages' AND column_name IN ('agency_id', 'key')) OR
        (table_name = 'patient_lead_details' AND column_name = 'lead_id')
      )
  ) <> 4 THEN
    RAISE EXCEPTION '029 requires the four upsert-key columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR current_user = 'mycaresight_app' THEN
    RAISE EXCEPTION '029 requires an independent migration owner and restricted runtime role';
  END IF;
END
$preflight$;

LOCK TABLE public.agency_configurations, public.agency_lead_stages,
  public.patient_lead_details IN SHARE ROW EXCLUSIVE MODE;

DO $duplicates$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.agency_configurations
    WHERE agency_id IS NOT NULL
    GROUP BY agency_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '029 found duplicate agency configuration keys';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agency_lead_stages
    WHERE agency_id IS NOT NULL AND key IS NOT NULL
    GROUP BY agency_id, key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '029 found duplicate agency lead stage keys';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.patient_lead_details
    WHERE lead_id IS NOT NULL
    GROUP BY lead_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '029 found duplicate patient lead detail keys';
  END IF;
END
$duplicates$;

CREATE UNIQUE INDEX IF NOT EXISTS agency_configurations_agency_id_key
  ON public.agency_configurations USING btree (agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS agency_lead_stages_agency_id_key_key
  ON public.agency_lead_stages USING btree (agency_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS patient_lead_details_lead_id_key
  ON public.patient_lead_details USING btree (lead_id);

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
    WHERE i.indrelid = 'public.agency_configurations'::regclass
      AND x.relname = 'agency_configurations_agency_id_key'
      AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts = 1 AND i.indnatts = 1
      AND i.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = i.indrelid AND attname = 'agency_id' AND NOT attisdropped
      )
  ) THEN
    RAISE EXCEPTION '029 agency configuration key does not match';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
    WHERE i.indrelid = 'public.agency_lead_stages'::regclass
      AND x.relname = 'agency_lead_stages_agency_id_key_key'
      AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts = 2 AND i.indnatts = 2
      AND i.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = i.indrelid AND attname = 'agency_id' AND NOT attisdropped
      )
      AND i.indkey[1] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = i.indrelid AND attname = 'key' AND NOT attisdropped
      )
  ) THEN
    RAISE EXCEPTION '029 agency lead stage key does not match';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
    WHERE i.indrelid = 'public.patient_lead_details'::regclass
      AND x.relname = 'patient_lead_details_lead_id_key'
      AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts = 1 AND i.indnatts = 1
      AND i.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = i.indrelid AND attname = 'lead_id' AND NOT attisdropped
      )
  ) THEN
    RAISE EXCEPTION '029 patient lead detail key does not match';
  END IF;
END
$verify$;

COMMIT;
