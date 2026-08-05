-- Migration 151: Add certification_category directly to licenses table
-- Removes the need for a license_types FK join on the certifications view.

ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS certification_category text
    CHECK (certification_category IN (
      'state_license', 'medicare', 'medicaid', 'accreditation', 'bond', 'insurance', 'other'
    ));
