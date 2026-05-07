-- Fix: application_steps had no agency-scoped RLS policies.
-- Migration 087 added is_agency_member() policies to applications and
-- application_documents but missed application_steps. Agency admins
-- (company_owner role) were silently blocked from reading or updating
-- steps on applications created by admins/experts for their agency.

-- SELECT: agency members can read steps for applications linked to their agency
CREATE POLICY "Agency members can view application steps"
  ON public.application_steps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_steps.application_id
        AND a.agency_id IS NOT NULL
        AND public.is_agency_member(a.agency_id)
    )
  );

-- UPDATE: agency members can mark steps complete/incomplete
CREATE POLICY "Agency members can update application steps"
  ON public.application_steps
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_steps.application_id
        AND a.agency_id IS NOT NULL
        AND public.is_agency_member(a.agency_id)
    )
  );

-- SELECT: platform staff (admin + expert) can read all application steps.
-- Experts are already covered by the existing "assigned_expert_id" policy,
-- but this ensures access even when an expert views an unassigned application.
CREATE POLICY "Platform staff can view all application steps"
  ON public.application_steps
  FOR SELECT
  USING (public.is_platform_staff());
