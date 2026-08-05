-- Migration 149: Certifications generalization + manual application status
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Extend license_types with certification_category
ALTER TABLE license_types
  ADD COLUMN IF NOT EXISTS certification_category text NOT NULL DEFAULT 'state_license'
    CHECK (certification_category IN (
      'state_license', 'medicare', 'medicaid', 'accreditation', 'bond', 'insurance', 'other'
    ));

-- 2. Generalize licenses table
ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS issuing_body text,
  ADD COLUMN IF NOT EXISTS first_issued_date date;

ALTER TABLE licenses
  ALTER COLUMN state DROP NOT NULL;

-- 3. certification_applications junction table
CREATE TABLE IF NOT EXISTS certification_applications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  application_id   uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  link_type        text NOT NULL DEFAULT 'renewal_of'
                     CHECK (link_type IN ('created_from', 'renewal_of')),
  linked_at        timestamptz NOT NULL DEFAULT now(),
  linked_by        uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  UNIQUE (certification_id, application_id)
);

CREATE INDEX IF NOT EXISTS certification_applications_certification_id_idx
  ON certification_applications (certification_id);

ALTER TABLE certification_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff full access on certification_applications"
  ON certification_applications FOR ALL
  USING (is_platform_staff());

CREATE POLICY "agency members can read certification_applications"
  ON certification_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM licenses l
      WHERE l.id = certification_id
        AND is_agency_member(l.agency_id)
    )
  );

CREATE POLICY "agency members can insert certification_applications"
  ON certification_applications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM licenses l
      WHERE l.id = certification_id
        AND is_agency_member(l.agency_id)
    )
  );

CREATE POLICY "agency members can delete certification_applications"
  ON certification_applications FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM licenses l
      WHERE l.id = certification_id
        AND is_agency_member(l.agency_id)
    )
  );

-- 4. Manual application status tracking columns
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS closed_by       uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS close_reason    text,
  ADD COLUMN IF NOT EXISTS completed_by    uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS complete_reason text;
