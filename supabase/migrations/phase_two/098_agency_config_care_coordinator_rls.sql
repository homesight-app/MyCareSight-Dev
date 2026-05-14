-- Care coordinators are stored in the care_coordinators table, not agency_admins.
-- The existing is_agency_member() function only checks agency_admins, so the
-- migration 095 RLS policies blocked care coordinators from saving agency configuration.

CREATE OR REPLACE FUNCTION public.is_care_coordinator_for_agency(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.care_coordinators
    WHERE agency_id = p_agency_id
      AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Care coordinators can view their agency configuration"
  ON public.agency_configurations FOR SELECT
  USING (public.is_care_coordinator_for_agency(agency_id));

CREATE POLICY "Care coordinators can insert their agency configuration"
  ON public.agency_configurations FOR INSERT
  WITH CHECK (public.is_care_coordinator_for_agency(agency_id));

CREATE POLICY "Care coordinators can update their agency configuration"
  ON public.agency_configurations FOR UPDATE
  USING (public.is_care_coordinator_for_agency(agency_id));
