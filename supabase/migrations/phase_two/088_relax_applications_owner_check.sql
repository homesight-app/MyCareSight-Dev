-- The original constraint required company_owner_id to be set.
-- Now that applications can be agency-owned (agency_id set, company_owner_id null),
-- we expand the check to allow either anchor.
-- NOTE: staff_member_id column does not exist in the live DB — omitted intentionally.
ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_owner_or_staff_check;

ALTER TABLE applications
  ADD CONSTRAINT applications_owner_or_staff_check CHECK (
    company_owner_id IS NOT NULL
    OR agency_id IS NOT NULL
  );
