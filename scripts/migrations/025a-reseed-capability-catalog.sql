-- Restore the fixed capability reference catalog when a schema-only branch copy omits seed rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '025a must not run against Supabase';
  END IF;
  IF to_regclass('public.capability_catalog') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '025a requires capability_catalog and audit_log';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '025a requires an independent migration owner and restricted runtime role';
  END IF;
END
$preflight$;

WITH changed AS (
  INSERT INTO public.capability_catalog (
    key, label, description, sort_order, is_active
  )
  VALUES
    ('client_management', 'Client Management', 'Manage leads, clients, and client records.', 10, true),
    ('care_operations', 'Care Operations', 'Scheduling, assignment, shift advertising, visit execution, pay and bill rates, time, billing, and payroll preparation.', 20, true),
    ('caregiver_management', 'Caregiver Management', 'Create and manage caregiver accounts and profiles.', 30, true),
    ('agency_compliance', 'Agency Compliance', 'Manage agency certification and compliance records.', 40, true),
    ('analytics_reporting', 'Analytics & Reporting', 'View operational reports and exports.', 50, true),
    ('homesights_services', 'HomeSights Services', 'Access HomeSights services and reusable templates.', 60, true)
  ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      is_active = true,
      updated_at = now()
  WHERE (
    capability_catalog.label,
    capability_catalog.description,
    capability_catalog.sort_order,
    capability_catalog.is_active
  ) IS DISTINCT FROM (
    EXCLUDED.label,
    EXCLUDED.description,
    EXCLUDED.sort_order,
    true
  )
  RETURNING key
)
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT
  NULL,
  'capability_catalog',
  NULL,
  'RESEED_REFERENCE_DATA',
  NULL,
  jsonb_build_object(
    'source', 'migration_025a',
    'changed_row_count', count(*)
  )
FROM changed
HAVING count(*) > 0;

COMMIT;
