-- Allow agency members to read validation run summary counts for items
-- belonging to their agency's applications. Used to show the Validation
-- Summary on the client-side Overview tab without exposing staff-only details.
CREATE POLICY vr_agency_select ON public.validation_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.application_playbook_items api
      JOIN public.applications a ON a.id = api.application_id
      WHERE api.id = validation_runs.application_playbook_item_id
        AND is_agency_member(a.agency_id)
    )
  );
