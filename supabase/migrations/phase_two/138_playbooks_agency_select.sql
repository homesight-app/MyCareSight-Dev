-- Allow authenticated users (agency owners, staff) to read active playbooks
-- so clients can browse and request standalone programs.
CREATE POLICY "authenticated_select_active_playbooks"
  ON public.playbooks FOR SELECT
  USING (is_active = true);
