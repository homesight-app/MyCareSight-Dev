-- 032: Let active agency care coordinators use the audited visit correction workflow.
-- Apply after 031 on each Neon branch. Changes policies only; no row changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '032 must not run against Supabase';
  END IF;
  IF to_regclass('public.visit_corrections') IS NULL THEN
    RAISE EXCEPTION '032 requires migration 030';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.visit_corrections'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) OR has_table_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE,REFERENCES') THEN
    RAISE EXCEPTION '032 requires the verified append-only privileges from 031';
  END IF;
END
$preflight$;

DROP POLICY IF EXISTS visit_corrections_owner_read ON public.visit_corrections;
DROP POLICY IF EXISTS visit_corrections_owner_insert ON public.visit_corrections;
DROP POLICY IF EXISTS visit_corrections_manager_read ON public.visit_corrections;
DROP POLICY IF EXISTS visit_corrections_manager_insert ON public.visit_corrections;

CREATE POLICY visit_corrections_manager_read ON public.visit_corrections
  FOR SELECT TO mycaresight_app USING (
    public.visit_financial_manager_can_read(agency_id)
    AND current_setting('app.current_user_role', true) IN ('company_owner', 'care_coordinator')
    AND EXISTS (
      SELECT 1 FROM public.scheduled_visits visit
      WHERE visit.id = scheduled_visit_id AND visit.agency_id = visit_corrections.agency_id
    )
  );

CREATE POLICY visit_corrections_manager_insert ON public.visit_corrections
  FOR INSERT TO mycaresight_app WITH CHECK (
    public.visit_financial_manager_can_read(agency_id)
    AND current_setting('app.current_user_role', true) IN ('company_owner', 'care_coordinator')
    AND corrected_by_user_id::text = NULLIF(current_setting('app.current_user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM public.scheduled_visits visit
      WHERE visit.id = scheduled_visit_id AND visit.agency_id = visit_corrections.agency_id
    )
  );

DO $verify$
BEGIN
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'visit_corrections') <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'visit_corrections' AND policyname = 'visit_corrections_manager_read'
      AND cmd = 'SELECT')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'visit_corrections' AND policyname = 'visit_corrections_manager_insert'
      AND cmd = 'INSERT') THEN
    RAISE EXCEPTION '032 did not establish exactly the expected manager policies';
  END IF;
END
$verify$;

COMMIT;
