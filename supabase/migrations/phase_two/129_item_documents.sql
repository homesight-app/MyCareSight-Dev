-- Migration 129: Link application_documents to application_playbook_items
-- and expand internal_notes subject_type to include playbook items.

-- Link uploaded documents to specific requirement checklist items
ALTER TABLE public.application_documents
  ADD COLUMN IF NOT EXISTS application_playbook_item_id uuid
    REFERENCES public.application_playbook_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS app_docs_playbook_item_idx
  ON public.application_documents(application_playbook_item_id)
  WHERE application_playbook_item_id IS NOT NULL;

-- Expand internal_notes subject_type to allow notes on playbook items
ALTER TABLE public.internal_notes
  DROP CONSTRAINT IF EXISTS internal_notes_subject_type_check;

ALTER TABLE public.internal_notes
  ADD CONSTRAINT internal_notes_subject_type_check
  CHECK (subject_type = ANY (ARRAY[
    'patient'::text,
    'caregiver'::text,
    'visit'::text,
    'application'::text,
    'application_step'::text,
    'application_document'::text,
    'application_playbook_item'::text
  ]));
