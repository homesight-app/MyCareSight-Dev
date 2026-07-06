-- Track which license_requirement_document a program item was migrated from.
-- Needed so migrateApplicationToProgram can source document items from the
-- license requirement template (not just uploaded application_documents).

ALTER TABLE public.application_playbook_items
  ADD COLUMN IF NOT EXISTS source_license_requirement_document_id uuid
    REFERENCES public.license_requirement_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS app_playbook_items_lrd_idx
  ON public.application_playbook_items(source_license_requirement_document_id)
  WHERE source_license_requirement_document_id IS NOT NULL;
