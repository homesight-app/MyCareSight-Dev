-- Extend internal_notes: add 'visit' subject type + optional caregiver/patient tag columns

-- 1. Expand subject_type check constraint to include 'visit'
ALTER TABLE public.internal_notes
  DROP CONSTRAINT internal_notes_subject_type_check;

ALTER TABLE public.internal_notes
  ADD CONSTRAINT internal_notes_subject_type_check
  CHECK (subject_type IN ('patient', 'caregiver', 'visit'));

-- 2. Add optional tag columns (polymorphic references)
ALTER TABLE public.internal_notes
  ADD COLUMN tagged_patient_id   uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  ADD COLUMN tagged_caregiver_id uuid REFERENCES public.caregiver_members(id) ON DELETE SET NULL;

-- Partial indexes — only index rows that actually carry a tag
CREATE INDEX idx_internal_notes_tagged_patient
  ON public.internal_notes (tagged_patient_id)
  WHERE tagged_patient_id IS NOT NULL;

CREATE INDEX idx_internal_notes_tagged_caregiver
  ON public.internal_notes (tagged_caregiver_id)
  WHERE tagged_caregiver_id IS NOT NULL;
