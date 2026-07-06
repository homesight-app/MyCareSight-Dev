-- Agency members can submit their own application playbook items for review.
-- They may only set status = 'in_progress'; the server action validates the
-- transition is from 'not_started' or 'review_needed'.
CREATE POLICY agency_submit_app_playbook_items
  ON public.application_playbook_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND is_agency_member(a.agency_id)
    )
  )
  WITH CHECK (status = 'in_progress');
