-- Internal Notes: private notes for caregivers and patients, visible only to
-- agency admins and care coordinators. Hidden from caregivers/staff.
CREATE TABLE public.internal_notes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  subject_type    text        NOT NULL CHECK (subject_type IN ('patient', 'caregiver')),
  subject_id      uuid        NOT NULL,
  content         text        NOT NULL CHECK (char_length(content) > 0),
  created_by      uuid        NOT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by      uuid        REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_notes_subject
  ON public.internal_notes (agency_id, subject_type, subject_id);

ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;

-- hs_can_manage_agency() covers agency_admins table members and care_coordinators.
-- It explicitly excludes staff_member (caregiver) role — no data leaks to caregivers.
CREATE POLICY "internal_notes_select" ON public.internal_notes
  FOR SELECT USING (public.hs_can_manage_agency(agency_id));

CREATE POLICY "internal_notes_insert" ON public.internal_notes
  FOR INSERT WITH CHECK (public.hs_can_manage_agency(agency_id));

CREATE POLICY "internal_notes_update" ON public.internal_notes
  FOR UPDATE USING (public.hs_can_manage_agency(agency_id));

CREATE POLICY "internal_notes_delete" ON public.internal_notes
  FOR DELETE USING (public.hs_can_manage_agency(agency_id));
