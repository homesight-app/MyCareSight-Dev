-- 003 OPTIONAL: synthetic credential reference rows for Dev/UAT testing only.
-- No accounts, people, visits, financial records, or production data are inserted.
-- Run manually as the migration owner after 002; runtime access remains closed.
-- Fixed TEST_ codes identify disposable test references. Re-running preserves matching rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '003 synthetic references must not be seeded in the Supabase source';
  END IF;
  IF to_regclass('public.credential_catalog') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 002 before the optional synthetic reference seed';
  END IF;
END
$preflight$;

DO $seed$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('10000000-0000-4000-8000-000000000001'::uuid, 'TEST_LICENSE', 'Synthetic test license', 'license', 9001),
      ('10000000-0000-4000-8000-000000000002'::uuid, 'TEST_CERTIFICATION', 'Synthetic test certification', 'certification', 9002),
      ('10000000-0000-4000-8000-000000000003'::uuid, 'TEST_SKILL', 'Synthetic test skill', 'skill', 9003),
      ('10000000-0000-4000-8000-000000000004'::uuid, 'TEST_ROLE', 'Synthetic test role', 'role', 9004)
    ) AS fixture(id, code, name, credential_type, display_order)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.credential_catalog c
      WHERE (c.id=item.id OR c.code=item.code)
        AND (c.id IS DISTINCT FROM item.id OR c.code IS DISTINCT FROM item.code
          OR c.name IS DISTINCT FROM item.name OR c.credential_type IS DISTINCT FROM item.credential_type
          OR c.display_order IS DISTINCT FROM item.display_order OR c.service_type IS NOT NULL
          OR c.is_active IS DISTINCT FROM true)
    ) THEN
      RAISE EXCEPTION '003 found an existing reference that conflicts with a reserved synthetic fixture; no rows changed';
    END IF;
    INSERT INTO public.credential_catalog (id,code,name,credential_type,display_order)
      VALUES (item.id,item.code,item.name,item.credential_type,item.display_order)
      ON CONFLICT (code) DO NOTHING;
  END LOOP;
END
$seed$;
COMMIT;
