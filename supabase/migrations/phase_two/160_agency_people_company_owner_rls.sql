-- Migration 160: RLS policies for company_owner on agency_key_staff and care_coordinators
-- Enables agency owners to self-manage their team via the unified People tab.
--
-- agency_admins is already covered by:
--   SELECT: hs_can_access_agency(agency_id) which calls hs_is_agency_admin
--   UPDATE/DELETE: hs_is_agency_admin(agency_id)
--
-- agency_key_staff currently only has the platform-staff ALL policy.
-- care_coordinators currently only has admin-role SELECT and own-row SELECT/UPDATE.

-- ── agency_key_staff ─────────────────────────────────────────────────────────

CREATE POLICY "agency_key_staff_agency_admin_select"
  ON public.agency_key_staff
  FOR SELECT
  TO authenticated
  USING (hs_is_agency_admin(agency_id) OR is_platform_staff());

CREATE POLICY "agency_key_staff_agency_admin_insert"
  ON public.agency_key_staff
  FOR INSERT
  TO authenticated
  WITH CHECK (hs_is_agency_admin(agency_id) OR is_platform_staff());

CREATE POLICY "agency_key_staff_agency_admin_update"
  ON public.agency_key_staff
  FOR UPDATE
  TO authenticated
  USING (hs_is_agency_admin(agency_id) OR is_platform_staff())
  WITH CHECK (hs_is_agency_admin(agency_id) OR is_platform_staff());

-- ── care_coordinators ────────────────────────────────────────────────────────

CREATE POLICY "care_coordinators_agency_admin_select"
  ON public.care_coordinators
  FOR SELECT
  TO authenticated
  USING (hs_is_agency_admin(agency_id) OR is_platform_staff());

CREATE POLICY "care_coordinators_agency_admin_update"
  ON public.care_coordinators
  FOR UPDATE
  TO authenticated
  USING (hs_is_agency_admin(agency_id) OR is_platform_staff())
  WITH CHECK (hs_is_agency_admin(agency_id) OR is_platform_staff());
