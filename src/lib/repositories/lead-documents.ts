import 'server-only'
import sql from '@/db'

export type LeadDocumentRecord = {
  id: string
  lead_id: string
  document_name: string
  file_url: string
  file_name: string | null
  document_type: string | null
  created_at: string
}

export type ManageableLead = {
  id: string
  lead_type: 'agency' | 'patient'
  agency_id: string | null
  lead_owner_id: string | null
  converted_agency_id: string | null
  converted_client_id: string | null
  converted_at: string | null
}

export async function getManageableLead(leadId: string, actorId: string) {
  const rows = await sql<ManageableLead[]>`
    SELECT lead.id, lead.lead_type, lead.agency_id, lead.lead_owner_id, lead.converted_agency_id,
      lead.converted_client_id, lead.converted_at
    FROM public.leads lead
    JOIN public.user_profiles actor
      ON actor.id = ${actorId}::uuid AND actor.is_active = true
    WHERE lead.id = ${leadId}::uuid
      AND (
        actor.role IN ('admin', 'expert')
        OR (
          actor.role IN ('company_owner', 'care_coordinator')
          AND EXISTS (
            SELECT 1 FROM public.user_agency_roles membership
            WHERE membership.user_id = actor.id
              AND membership.agency_id = lead.agency_id
              AND membership.role = actor.role
              AND membership.status = 'active'
          )
        )
      )
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function insertLeadDocument(data: {
  leadId: string
  name: string
  path: string
  originalFileName: string
  documentType: string | null
  uploadedBy: string
}) {
  const rows = await sql<LeadDocumentRecord[]>`
    INSERT INTO public.lead_documents (
      lead_id, document_name, file_url, file_name, document_type, uploaded_by
    ) VALUES (
      ${data.leadId}::uuid, ${data.name}, ${data.path}, ${data.originalFileName},
      ${data.documentType}, ${data.uploadedBy}::uuid
    )
    RETURNING id, lead_id, document_name, file_url, file_name, document_type, created_at
  `
  return rows[0] ?? null
}

export async function getManageableLeadDocument(
  leadId: string,
  documentId: string,
  actorId: string,
) {
  const lead = await getManageableLead(leadId, actorId)
  if (!lead) return null
  const rows = await sql<LeadDocumentRecord[]>`
    SELECT id, lead_id, document_name, file_url, file_name, document_type, created_at
    FROM public.lead_documents
    WHERE id = ${documentId}::uuid AND lead_id = ${leadId}::uuid
    LIMIT 1
    FOR UPDATE
  `
  return rows[0] ? { lead, document: rows[0] } : null
}

export async function deleteLeadDocument(documentId: string) {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM public.lead_documents
    WHERE id = ${documentId}::uuid
    RETURNING id
  `
  return rows[0] ?? null
}

export async function getConvertedLeadDocumentsForPatient(
  patientId: string,
  agencyId: string,
) {
  const rows = await sql<LeadDocumentRecord[]>`
    SELECT document.id, document.lead_id, document.document_name, document.file_url,
      document.file_name, document.document_type, document.created_at
    FROM public.lead_documents document
    JOIN public.leads lead ON lead.id = document.lead_id
    JOIN public.patients patient ON patient.id = lead.converted_client_id
    WHERE patient.id = ${patientId}::uuid
      AND patient.agency_id = ${agencyId}::uuid
      AND lead.agency_id = patient.agency_id
    ORDER BY document.created_at DESC
    LIMIT 200
  `
  return rows
}

