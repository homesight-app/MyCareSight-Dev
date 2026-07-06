-- Sample document templates that admins upload for a playbook.
-- Agencies can download these when their program is active.
CREATE TABLE IF NOT EXISTS public.playbook_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid        NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  template_name text      NOT NULL,
  description text,
  file_url    text        NOT NULL,
  file_name   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.playbook_templates ENABLE ROW LEVEL SECURITY;

-- Admins and experts can do anything
CREATE POLICY "staff_manage_playbook_templates"
  ON public.playbook_templates
  FOR ALL
  USING (is_platform_staff())
  WITH CHECK (is_platform_staff());

-- Agency members can read templates for programs they are enrolled in.
-- Path: playbook_templates → playbook_items → application_playbook_items → applications
CREATE POLICY "agency_read_playbook_templates"
  ON public.playbook_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.application_playbook_items api
      JOIN public.playbook_items pi ON pi.id = api.playbook_item_id
      JOIN public.applications a    ON a.id  = api.application_id
      WHERE pi.playbook_id = playbook_templates.playbook_id
        AND a.agency_id IN (
          SELECT agency_id FROM public.user_profiles WHERE id = auth.uid()
        )
    )
  );
