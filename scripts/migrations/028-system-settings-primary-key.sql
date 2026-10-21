-- 028: Reconcile byte-for-byte duplicate Neon system settings and restore the source primary key.
-- Neon-only. Each duplicate (category, key) group must contain identical complete rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '028 must not run against Supabase';
  END IF;
  IF to_regclass('public.system_settings') IS NULL THEN
    RAISE EXCEPTION '028 requires public.system_settings';
  END IF;
  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_settings'
      AND column_name IN ('category', 'key')
      AND is_nullable = 'NO'
  ) <> 2 THEN
    RAISE EXCEPTION '028 requires non-null category and key columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR current_user = 'mycaresight_app' THEN
    RAISE EXCEPTION '028 requires an independent migration owner and restricted runtime role';
  END IF;
END
$preflight$;

LOCK TABLE public.system_settings IN SHARE ROW EXCLUSIVE MODE;

DO $conflicts$
DECLARE conflicting_groups integer;
BEGIN
  SELECT count(*)::integer INTO conflicting_groups
  FROM (
    SELECT category, key
    FROM public.system_settings AS setting
    GROUP BY category, key
    HAVING count(*) > 1 AND count(DISTINCT to_jsonb(setting)) > 1
  ) groups_with_different_rows;
  IF conflicting_groups > 0 THEN
    RAISE EXCEPTION '028 found % system setting groups with different rows; reconcile before retrying', conflicting_groups;
  END IF;
END
$conflicts$;

-- ctid is used only inside this locked transaction to choose one of identical rows.
WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY category, key ORDER BY ctid) AS copy_number
  FROM public.system_settings
)
DELETE FROM public.system_settings AS setting
USING ranked
WHERE setting.ctid = ranked.ctid AND ranked.copy_number > 1;

DO $add_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.system_settings'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_pkey PRIMARY KEY (category, key);
  END IF;
END
$add_key$;

DO $verify$
BEGIN
  IF NOT EXISTS (
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
  ) THEN
    RAISE EXCEPTION '028 system_settings primary key does not match (category, key)';
  END IF;
END
$verify$;

COMMIT;
