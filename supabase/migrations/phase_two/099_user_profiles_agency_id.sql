-- Add agency_id directly to user_profiles so every agency-scoped role (company_owner,
-- care_coordinator, staff_member) has a single-table agency link. This eliminates the
-- recurring need to fan out to agency_admins / care_coordinators / caregiver_members
-- just to answer "which agency does this user belong to?"
--
-- admin and expert remain agency_id = NULL (platform-wide roles).

ALTER TABLE public.user_profiles
  ADD COLUMN agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_agency_id ON public.user_profiles(agency_id);

-- Backfill: company_owner → agency_admins
UPDATE public.user_profiles up
SET agency_id = aa.agency_id
FROM public.agency_admins aa
WHERE aa.user_id = up.id
  AND up.role = 'company_owner'
  AND up.agency_id IS NULL;

-- Backfill: care_coordinator → care_coordinators
UPDATE public.user_profiles up
SET agency_id = cc.agency_id
FROM public.care_coordinators cc
WHERE cc.user_id = up.id
  AND up.role = 'care_coordinator'
  AND up.agency_id IS NULL;

-- Backfill: staff_member → caregiver_members
UPDATE public.user_profiles up
SET agency_id = cm.agency_id
FROM public.caregiver_members cm
WHERE cm.user_id = up.id
  AND up.role = 'staff_member'
  AND up.agency_id IS NULL;

-- Update is_agency_member() to use user_profiles.agency_id directly.
-- Now covers company_owner, care_coordinator, and staff_member without
-- per-role gap fixes.
CREATE OR REPLACE FUNCTION public.is_agency_member(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND agency_id = p_agency_id
  );
$$;
