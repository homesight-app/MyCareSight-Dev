-- Fix missing storage RLS policies.
--
-- agency-documents: no policies existed at all — all operations were blocked.
-- lead-documents:   SELECT + DELETE existed but INSERT was missing, so uploads failed.

-- agency-documents — full access for platform staff
CREATE POLICY "platform_staff_insert_agency_documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agency-documents' AND is_platform_staff());

CREATE POLICY "platform_staff_select_agency_documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agency-documents' AND is_platform_staff());

CREATE POLICY "platform_staff_update_agency_documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agency-documents' AND is_platform_staff());

CREATE POLICY "platform_staff_delete_agency_documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agency-documents' AND is_platform_staff());

-- lead-documents — INSERT was missing (SELECT + DELETE already exist)
CREATE POLICY "platform_staff_insert_lead_documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-documents' AND is_platform_staff());
