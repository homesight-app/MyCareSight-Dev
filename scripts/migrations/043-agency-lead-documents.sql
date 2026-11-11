-- Allow agency managers to manage same-agency lead documents while preserving tenant isolation.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

CREATE INDEX IF NOT EXISTS idx_leads_converted_client_id
  ON public.leads (converted_client_id)
  WHERE converted_client_id IS NOT NULL;

ALTER TABLE public.lead_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_documents_platform ON public.lead_documents;
DROP POLICY IF EXISTS lead_documents_agency ON public.lead_documents;
DROP POLICY IF EXISTS lead_documents_select ON public.lead_documents;
DROP POLICY IF EXISTS lead_documents_insert ON public.lead_documents;
DROP POLICY IF EXISTS lead_documents_delete ON public.lead_documents;

CREATE POLICY lead_documents_select
  ON public.lead_documents FOR SELECT TO mycaresight_app
  USING (
    EXISTS (
      SELECT 1 FROM public.leads lead
      WHERE lead.id = lead_documents.lead_id
        AND (
          public.plan_actor_is_platform_staff()
          OR public.skill_actor_can_manage_agency(lead.agency_id)
        )
    )
  );

CREATE POLICY lead_documents_insert
  ON public.lead_documents FOR INSERT TO mycaresight_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads lead
      WHERE lead.id = lead_documents.lead_id
        AND (
          public.plan_actor_is_platform_staff()
          OR public.skill_actor_can_manage_agency(lead.agency_id)
        )
    )
  );

CREATE POLICY lead_documents_delete
  ON public.lead_documents FOR DELETE TO mycaresight_app
  USING (
    EXISTS (
      SELECT 1 FROM public.leads lead
      WHERE lead.id = lead_documents.lead_id
        AND (
          public.plan_actor_is_platform_staff()
          OR public.skill_actor_can_manage_agency(lead.agency_id)
        )
    )
  );

REVOKE ALL ON TABLE public.lead_documents FROM PUBLIC;
REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.lead_documents FROM mycaresight_app;
GRANT SELECT, INSERT, DELETE ON TABLE public.lead_documents TO mycaresight_app;

COMMENT ON TABLE public.lead_documents IS
  'Private agency lead documents retained on lead conversion and exposed to the linked client through authorized server queries.';
