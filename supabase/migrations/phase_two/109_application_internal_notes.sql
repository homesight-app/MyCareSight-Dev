-- Extend internal_notes for application-scoped notes visible only to platform staff (admin + expert).
-- Agency staff (care_coordinator, agency_admin) cannot see or write these note types.

-- 1. Extend the subject_type check constraint to include application note types
ALTER TABLE public.internal_notes
  DROP CONSTRAINT internal_notes_subject_type_check;

ALTER TABLE public.internal_notes
  ADD CONSTRAINT internal_notes_subject_type_check
  CHECK (subject_type IN (
    'patient', 'caregiver', 'visit',
    'application', 'application_step', 'application_document'
  ));

-- 2. Rewrite existing agency-staff policies to exclude the new application note types.
--    (Supabase does not support ALTER POLICY; drop and recreate is required.)
DROP POLICY "internal_notes_select" ON public.internal_notes;
DROP POLICY "internal_notes_insert" ON public.internal_notes;
DROP POLICY "internal_notes_update" ON public.internal_notes;
DROP POLICY "internal_notes_delete" ON public.internal_notes;

CREATE POLICY "internal_notes_select" ON public.internal_notes
  FOR SELECT USING (
    public.hs_can_manage_agency(agency_id)
    AND subject_type NOT IN ('application', 'application_step', 'application_document')
  );

CREATE POLICY "internal_notes_insert" ON public.internal_notes
  FOR INSERT WITH CHECK (
    public.hs_can_manage_agency(agency_id)
    AND subject_type NOT IN ('application', 'application_step', 'application_document')
  );

CREATE POLICY "internal_notes_update" ON public.internal_notes
  FOR UPDATE USING (
    public.hs_can_manage_agency(agency_id)
    AND subject_type NOT IN ('application', 'application_step', 'application_document')
  );

CREATE POLICY "internal_notes_delete" ON public.internal_notes
  FOR DELETE USING (
    public.hs_can_manage_agency(agency_id)
    AND subject_type NOT IN ('application', 'application_step', 'application_document')
  );

-- 3. New platform staff policies — admin + expert only, application note types only.
CREATE POLICY "internal_notes_select_platform" ON public.internal_notes
  FOR SELECT USING (
    public.is_platform_staff()
    AND subject_type IN ('application', 'application_step', 'application_document')
  );

CREATE POLICY "internal_notes_insert_platform" ON public.internal_notes
  FOR INSERT WITH CHECK (
    public.is_platform_staff()
    AND subject_type IN ('application', 'application_step', 'application_document')
  );

CREATE POLICY "internal_notes_update_platform" ON public.internal_notes
  FOR UPDATE USING (
    public.is_platform_staff()
    AND subject_type IN ('application', 'application_step', 'application_document')
  );

CREATE POLICY "internal_notes_delete_platform" ON public.internal_notes
  FOR DELETE USING (
    public.is_platform_staff()
    AND subject_type IN ('application', 'application_step', 'application_document')
  );
