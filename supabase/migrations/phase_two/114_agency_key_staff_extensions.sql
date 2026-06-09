-- Migration 114: Add missing fields to agency_key_staff from FL intake form
ALTER TABLE public.agency_key_staff
  ADD COLUMN IF NOT EXISTS ownership_percentage        text,
  ADD COLUMN IF NOT EXISTS professional_license_number text,
  ADD COLUMN IF NOT EXISTS employment_type             text;

-- ownership_percentage: "Ownership Percentage" — used for member_owner role rows
-- professional_license_number: "Professional License #" — FL professional license number
--   (distinct from is_licensed/license_type which track license category)
-- employment_type: "Part time or full time?" — 'full_time' | 'part_time'
--   applies to administrator, alternate_administrator, rn_supervisor roles

-- Note: 'member_owner' and 'rn_supervisor' are valid officer_role values —
--   no schema change needed since officer_role is already text.
--   Multiple 'member_owner' rows per agency are allowed (no unique constraint on role).
