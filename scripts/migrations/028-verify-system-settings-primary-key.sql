-- Read-only verification for migration 028. Expect key_ok=true and duplicate_groups=0.
SELECT
  EXISTS (
    SELECT 1
    FROM pg_index index_record
    JOIN pg_class index_relation ON index_relation.oid = index_record.indexrelid
    WHERE index_record.indrelid = 'public.system_settings'::regclass
      AND index_relation.relname = 'system_settings_pkey'
      AND index_record.indisprimary
      AND index_record.indisunique
      AND index_record.indisvalid
      AND index_record.indpred IS NULL
      AND index_record.indexprs IS NULL
      AND index_record.indnkeyatts = 2
      AND index_record.indnatts = 2
      AND index_record.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = index_record.indrelid AND attname = 'category' AND NOT attisdropped
      )
      AND index_record.indkey[1] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = index_record.indrelid AND attname = 'key' AND NOT attisdropped
      )
  ) AS key_ok,
  (
    SELECT count(*)::integer
    FROM (
      SELECT category, key
      FROM public.system_settings
      GROUP BY category, key
      HAVING count(*) > 1
    ) duplicate_keys
  ) AS duplicate_groups;
