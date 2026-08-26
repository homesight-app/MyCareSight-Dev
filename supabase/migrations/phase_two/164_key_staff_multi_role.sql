-- Phase 3: Multi-role for Key Staff
-- Allows agency_key_staff records to hold multiple officer roles simultaneously.
-- officer_role (single value) is kept for backward compatibility with the onboarding flow.
-- All new writes also populate officer_roles[]. officer_role will be dropped in a follow-up migration.

ALTER TABLE public.agency_key_staff
  ADD COLUMN IF NOT EXISTS officer_roles text[] NOT NULL DEFAULT '{}';

-- Backfill from the existing single-role column
UPDATE public.agency_key_staff
  SET officer_roles = ARRAY[officer_role]
  WHERE officer_role IS NOT NULL AND officer_roles = '{}';

-- GIN index for efficient array containment queries (e.g. WHERE 'president' = ANY(officer_roles))
CREATE INDEX IF NOT EXISTS idx_agency_key_staff_officer_roles
  ON public.agency_key_staff USING GIN (officer_roles);
