-- Migration 128: Application Playbook Item Tracking Columns
-- Adds audit trail columns and source traceability to application_playbook_items.
-- approved_at / approved_by: preserved when migrating completed steps, set on future approvals.
-- source_application_step_id / source_application_document_id: link back to original rows
-- when items are auto-migrated from application_steps / application_documents.

ALTER TABLE public.application_playbook_items
  ADD COLUMN IF NOT EXISTS approved_at                    timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by                    uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS source_application_step_id     uuid REFERENCES public.application_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_application_document_id uuid REFERENCES public.application_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS app_playbook_items_source_step_idx
  ON public.application_playbook_items(source_application_step_id)
  WHERE source_application_step_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS app_playbook_items_source_doc_idx
  ON public.application_playbook_items(source_application_document_id)
  WHERE source_application_document_id IS NOT NULL;
