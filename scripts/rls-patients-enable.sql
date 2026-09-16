-- Phase 4.5: Enable Row Level Security on the patients table.
--
-- Run after deploying the Phase 4.5 code hardening and after running:
--   scripts/neon-runtime-role-setup.sql
--
-- The app DATABASE_URL must use the mycaresight_app role, not neondb_owner.
-- FORCE ROW LEVEL SECURITY makes normal table-owner bypass subject to policy,
-- but PostgreSQL roles with BYPASSRLS still bypass RLS. This script therefore
-- fails if the required runtime role does not exist or has BYPASSRLS.
--
-- Rollback: run scripts/rls-patients-disable.sql

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.patients') IS NULL THEN
    RAISE EXCEPTION 'public.patients does not exist in this database.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'mycaresight_app'
      AND rolcanlogin = true
      AND rolbypassrls = false
  ) THEN
    RAISE EXCEPTION 'Runtime role mycaresight_app must exist, be LOGIN, and have rolbypassrls=false before enabling patients RLS.';
  END IF;
END $$;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_agency_rls ON public.patients;

-- Policy: admin + expert get full access. Known agency-scoped app roles are
-- scoped to their agency via app.current_agency_id, set by withUserContext.
-- Missing or empty context returns no rows instead of raising a UUID cast error.
CREATE POLICY patients_agency_rls ON public.patients
  FOR ALL
  TO mycaresight_app
  USING (
    current_setting('app.current_user_role', true) IN ('admin', 'expert')
    OR (
      current_setting('app.current_user_role', true) IN ('company_owner', 'care_coordinator', 'staff_member')
      AND agency_id = NULLIF(current_setting('app.current_agency_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.current_user_role', true) IN ('admin', 'expert')
    OR (
      current_setting('app.current_user_role', true) IN ('company_owner', 'care_coordinator', 'staff_member')
      AND agency_id = NULLIF(current_setting('app.current_agency_id', true), '')::uuid
    )
  );

COMMIT;

-- Verification queries (run after COMMIT).
--
-- 1. Confirm the app runtime role cannot bypass RLS:
--    SELECT rolname, rolcanlogin, rolbypassrls
--    FROM pg_roles
--    WHERE rolname = 'mycaresight_app';
--    -- Expected: rolcanlogin = true, rolbypassrls = false
--
-- 2. Confirm RLS is enabled and forced:
--    SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname = 'patients';
--    -- Expected: relrowsecurity = true, relforcerowsecurity = true
--
-- 3. Confirm policy was created for the runtime role:
--    SELECT schemaname, tablename, policyname, cmd, roles, permissive
--    FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'patients';
--    -- Expected: policyname = patients_agency_rls, roles includes mycaresight_app
--
-- 4. Get real test agency IDs while connected as owner/admin:
--    SELECT agency_id, COUNT(*)::int AS patient_count
--    FROM public.patients
--    GROUP BY agency_id
--    ORDER BY patient_count DESC
--    LIMIT 5;
--
-- 5. Test no context as the runtime role:
--    BEGIN;
--    SET LOCAL ROLE mycaresight_app;
--    SELECT COUNT(*) FROM public.patients;
--    -- Expected: 0
--    ROLLBACK;
--
-- 6. Test same-agency visibility as the runtime role:
--    BEGIN;
--    SET LOCAL ROLE mycaresight_app;
--    SELECT set_config('app.current_user_role', 'company_owner', true),
--           set_config('app.current_agency_id', '<test_agency_uuid>', true);
--    SELECT COUNT(*) FROM public.patients
--    WHERE agency_id = '<test_agency_uuid>'::uuid;
--    -- Expected: equals the owner/admin count for that agency
--    ROLLBACK;
--
-- 7. Test unexpected-role fail-closed behavior as the runtime role:
--    BEGIN;
--    SET LOCAL ROLE mycaresight_app;
--    SELECT set_config('app.current_user_role', 'unexpected_role', true),
--           set_config('app.current_agency_id', '<test_agency_uuid>', true);
--    SELECT COUNT(*) FROM public.patients;
--    -- Expected: 0
--    ROLLBACK;
--
-- 8. Test cross-agency isolation as the runtime role:
--    BEGIN;
--    SET LOCAL ROLE mycaresight_app;
--    SELECT set_config('app.current_user_role', 'company_owner', true),
--           set_config('app.current_agency_id', '<other_agency_uuid>', true);
--    SELECT COUNT(*) FROM public.patients
--    WHERE agency_id = '<test_agency_uuid>'::uuid;
--    -- Expected: 0. Use two different agency UUIDs.
--    ROLLBACK;
--
-- 9. Test platform role access as the runtime role:
--    BEGIN;
--    SET LOCAL ROLE mycaresight_app;
--    SELECT set_config('app.current_user_role', 'admin', true);
--    SELECT COUNT(*) FROM public.patients;
--    -- Expected: all rows visible to the runtime role
--    ROLLBACK;
--
-- 10. Finally, connect using the actual app DATABASE_URL and verify:
--    SELECT current_user, rolbypassrls
--    FROM pg_roles
--    WHERE rolname = current_user;
--    -- Expected: current_user = mycaresight_app, rolbypassrls = false
