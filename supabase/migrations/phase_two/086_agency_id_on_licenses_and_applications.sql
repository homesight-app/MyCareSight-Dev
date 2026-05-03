-- Add agency_id to licenses
-- Nullable so admin/expert-created licenses don't require a specific user account
ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Add agency_id to applications
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Backfill licenses: agency_admins.user_id = licenses.company_owner_id -> agency_admins.agency_id
UPDATE licenses l
SET agency_id = aa.agency_id
FROM agency_admins aa
WHERE l.company_owner_id = aa.user_id
  AND aa.agency_id IS NOT NULL
  AND l.agency_id IS NULL;

-- Backfill applications
UPDATE applications a
SET agency_id = aa.agency_id
FROM agency_admins aa
WHERE a.company_owner_id = aa.user_id
  AND aa.agency_id IS NOT NULL
  AND a.agency_id IS NULL;

-- Make company_owner_id nullable so admin/expert can create licenses for agencies
-- without tying them to a specific user account
ALTER TABLE licenses ALTER COLUMN company_owner_id DROP NOT NULL;
ALTER TABLE applications ALTER COLUMN company_owner_id DROP NOT NULL;

-- Index for agency-scoped queries on both tables
CREATE INDEX IF NOT EXISTS idx_licenses_agency_id ON licenses(agency_id);
CREATE INDEX IF NOT EXISTS idx_applications_agency_id ON applications(agency_id);
