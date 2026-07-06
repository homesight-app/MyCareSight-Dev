-- Extend platform RLS policies on internal_notes to include application_playbook_item

DROP POLICY IF EXISTS internal_notes_select_platform ON public.internal_notes;
CREATE POLICY internal_notes_select_platform ON public.internal_notes
  FOR SELECT
  USING (
    is_platform_staff() AND subject_type = ANY (ARRAY[
      'application', 'application_step', 'application_document', 'application_playbook_item'
    ])
  );

DROP POLICY IF EXISTS internal_notes_insert_platform ON public.internal_notes;
CREATE POLICY internal_notes_insert_platform ON public.internal_notes
  FOR INSERT
  WITH CHECK (
    is_platform_staff() AND subject_type = ANY (ARRAY[
      'application', 'application_step', 'application_document', 'application_playbook_item'
    ])
  );

DROP POLICY IF EXISTS internal_notes_update_platform ON public.internal_notes;
CREATE POLICY internal_notes_update_platform ON public.internal_notes
  FOR UPDATE
  USING (
    is_platform_staff() AND subject_type = ANY (ARRAY[
      'application', 'application_step', 'application_document', 'application_playbook_item'
    ])
  );

DROP POLICY IF EXISTS internal_notes_delete_platform ON public.internal_notes;
CREATE POLICY internal_notes_delete_platform ON public.internal_notes
  FOR DELETE
  USING (
    is_platform_staff() AND subject_type = ANY (ARRAY[
      'application', 'application_step', 'application_document', 'application_playbook_item'
    ])
  );
