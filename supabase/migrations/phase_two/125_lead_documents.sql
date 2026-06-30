-- Migration 125: Lead Documents
-- Adds a documents table for leads (proposals, contracts, etc.)
-- No schema changes needed for agency association — uses existing converted_agency_id column.

CREATE TABLE IF NOT EXISTS public.lead_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  document_name text NOT NULL,
  file_url      text NOT NULL,
  file_name     text,
  document_type text,
  description   text,
  uploaded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_documents_lead_id_idx ON public.lead_documents (lead_id);

ALTER TABLE public.lead_documents ENABLE ROW LEVEL SECURITY;

-- Platform staff (admin/expert) have full access to agency-type leads
CREATE POLICY "lead_documents_platform"
  ON public.lead_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_documents.lead_id
        AND l.lead_type = 'agency'
        AND is_platform_staff()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_documents.lead_id
        AND l.lead_type = 'agency'
        AND is_platform_staff()
    )
  );

-- Agency members have full access to documents on their own patient leads
CREATE POLICY "lead_documents_agency"
  ON public.lead_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.agencies ag ON ag.id = l.agency_id
      WHERE l.id = lead_documents.lead_id
        AND l.lead_type = 'patient'
        AND is_agency_member(ag.id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.agencies ag ON ag.id = l.agency_id
      WHERE l.id = lead_documents.lead_id
        AND l.lead_type = 'patient'
        AND is_agency_member(ag.id)
    )
  );

-- Storage policies for the lead-documents bucket.
-- Role gating is enforced at the server action layer; storage just requires authentication.
CREATE POLICY "Authenticated users can upload lead-documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lead-documents'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can read lead-documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'lead-documents'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can delete lead-documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lead-documents'
  );
