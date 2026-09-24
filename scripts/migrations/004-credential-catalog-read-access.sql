-- 004: credential reference SELECT only. Dev first, then UAT with matching code.
-- One-time after 002. Production/Supabase are outside this migration slice.
-- Global reference labels: an active agency membership is required for agency roles.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE dependency text;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '004 must not run against the Supabase source';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
      OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '004 requires an independent migration owner and a restricted runtime role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.credential_catalog')
      AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION '004 requires the staged credential table from 002';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.credential_catalog'::regclass)
      OR has_table_privilege('mycaresight_app','public.credential_catalog',
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '004 requires untouched staging access; use verification if already applied';
  END IF;
  FOREACH dependency IN ARRAY ARRAY['user_profiles','user_agency_roles','task_required_credentials','task_catalog','task_categories']
  LOOP
    IF to_regclass(format('public.%I',dependency)) IS NULL THEN
      RAISE EXCEPTION '004 missing dependency: %',dependency;
    END IF;
    IF NOT has_table_privilege('mycaresight_app',format('public.%I',dependency),'SELECT') THEN
      RAISE EXCEPTION '004 runtime lacks SELECT on dependency: %',dependency;
    END IF;
  END LOOP;
END
$preflight$;

CREATE POLICY credential_catalog_active_reference_select ON public.credential_catalog
  FOR SELECT TO mycaresight_app
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles actor
    WHERE actor.id::text = NULLIF(current_setting('app.current_user_id', true), '')
      AND actor.is_active = true
      AND (
        actor.role IN ('admin', 'expert')
        OR (
          actor.role IN ('company_owner', 'care_coordinator', 'staff_member')
          AND EXISTS (
            SELECT 1 FROM public.user_agency_roles membership
            WHERE membership.user_id = actor.id AND membership.role = actor.role
              AND membership.status = 'active'
          )
        )
      )
  ));
GRANT SELECT ON TABLE public.credential_catalog TO mycaresight_app;

-- No INSERT/UPDATE/DELETE grants or policies; no other table's access is changed.
COMMIT;
