-- Read-only verification for migration 029. Expect all three key_ok values=true and duplicate_groups=0.
WITH key_status AS (
  SELECT 'agency_configurations'::text AS table_name,
    EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
      WHERE i.indrelid = 'public.agency_configurations'::regclass
        AND x.relname = 'agency_configurations_agency_id_key'
        AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnkeyatts = 1 AND i.indnatts = 1
        AND i.indkey[0] = (
          SELECT attnum FROM pg_attribute
          WHERE attrelid = i.indrelid AND attname = 'agency_id' AND NOT attisdropped
        )
    ) AS key_ok,
    (SELECT count(*)::integer FROM (
      SELECT agency_id FROM public.agency_configurations
      WHERE agency_id IS NOT NULL GROUP BY agency_id HAVING count(*) > 1
    ) d) AS duplicate_groups
  UNION ALL
  SELECT 'agency_lead_stages',
    EXISTS (
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
    ),
    (SELECT count(*)::integer FROM (
      SELECT agency_id, key FROM public.agency_lead_stages
      WHERE agency_id IS NOT NULL AND key IS NOT NULL
      GROUP BY agency_id, key HAVING count(*) > 1
    ) d)
  UNION ALL
  SELECT 'patient_lead_details',
    EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
      WHERE i.indrelid = 'public.patient_lead_details'::regclass
        AND x.relname = 'patient_lead_details_lead_id_key'
        AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnkeyatts = 1 AND i.indnatts = 1
        AND i.indkey[0] = (
          SELECT attnum FROM pg_attribute
          WHERE attrelid = i.indrelid AND attname = 'lead_id' AND NOT attisdropped
        )
    ),
    (SELECT count(*)::integer FROM (
      SELECT lead_id FROM public.patient_lead_details
      WHERE lead_id IS NOT NULL GROUP BY lead_id HAVING count(*) > 1
    ) d)
)
SELECT table_name, key_ok, duplicate_groups FROM key_status ORDER BY table_name;
