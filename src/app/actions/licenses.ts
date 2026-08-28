'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import { removeFiles } from '@/lib/storage/client'

function assertCanManageCert(role: string | null | undefined): string | null {
  const allowed = ['admin', 'expert', 'company_owner', 'care_coordinator']
  return allowed.includes(role ?? '') ? null : 'Forbidden'
}

/**
 * Revalidate the dashboard licenses page so the license list refetches after create/update.
 */
export async function revalidateLicensesPage() {
  revalidatePath('/pages/agency/licenses')
}

export type CreateLicenseForAgencyInput = {
  agencyId: string
  license_name: string
  state?: string
  license_number?: string
  activated_date: string
  expiry_date: string
  renewal_due_date?: string
  category_id?: string | null
  subcategory_id?: string | null
  issuing_body?: string
  documents?: {
    url: string
    name: string
    type: string | null
  }[]
}

/**
 * Admin/expert server action to add a license directly to an agency.
 * Sets agency_id and leaves company_owner_id null (agency-owned, not user-owned).
 * Optionally attaches a license document record (file must be uploaded to storage by the caller first).
 */
export async function createLicenseForAgency(input: CreateLicenseForAgencyInput) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabaseAdmin = createAdminClient()

  const { data: newLicense, error } = await q.insertLicenseReturning(supabaseAdmin, {
    agency_id: input.agencyId,
    company_owner_id: null,
    license_name: input.license_name,
    license_number: input.license_number || null,
    state: input.state || null,
    status: 'active',
    activated_date: input.activated_date,
    expiry_date: input.expiry_date,
    renewal_due_date: input.renewal_due_date || null,
    category_id: input.category_id || null,
    subcategory_id: input.subcategory_id || null,
    issuing_body: input.issuing_body || null,
  })

  if (error) return { error: error.message, data: null }

  if (newLicense?.id && input.documents?.length) {
    for (const doc of input.documents) {
      const { error: docError } = await q.insertLicenseDocument(supabaseAdmin, {
        license_id: newLicense.id,
        document_name: doc.name,
        document_url: doc.url,
        document_type: doc.type,
      })
      if (docError) console.error('[licenses/createLicenseForAgency] Failed to insert license_document. licenseId=%s err=%s', newLicense.id, docError.message)
    }
  }

  const { error: auditErr } = await supabaseAdmin.from('audit_log').insert({
    agency_id: input.agencyId,
    table_name: 'licenses',
    record_id: newLicense?.id ?? null,
    action: 'INSERT',
    performed_by_user_id: session.user.id,
    details: {
      license_name:     input.license_name,
      state:            input.state,
      license_number:   input.license_number ?? null,
      activated_date:   input.activated_date,
      expiry_date:      input.expiry_date,
      document_count:   input.documents?.length ?? 0,
    },
  })
  if (auditErr) console.error('[licenses/createLicenseForAgency] Audit log failed. agencyId=%s err=%s', input.agencyId, auditErr.message)

  revalidatePath('/pages/admin/agencies/[id]', 'page')
  revalidatePath('/pages/expert/agencies/[id]', 'page')
  return { error: null, data: { id: newLicense?.id } }
}

function revalidateCertificationPages(agencyId: string) {
  revalidatePath(`/pages/admin/agencies/${agencyId}`)
  revalidatePath(`/pages/expert/agencies/${agencyId}`)
}

/**
 * Create a new certification and immediately link it to a program with link_type='created_from'.
 * Admin/expert only. Atomically creates the license row then inserts the junction row.
 */
export async function createCertificationAndLink(
  agencyId: string,
  applicationId: string,
  certData: Omit<CreateLicenseForAgencyInput, 'agencyId'>
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden' }

  // Auto-copy category from the source application if not explicitly provided
  let enrichedCertData = { ...certData }
  if (!enrichedCertData.category_id) {
    const supabaseAdmin = createAdminClient()
    const { data: app } = await supabaseAdmin
      .from('applications')
      .select('category_id, subcategory_id')
      .eq('id', applicationId)
      .single()
    if (app?.category_id) {
      enrichedCertData = {
        ...enrichedCertData,
        category_id: app.category_id,
        subcategory_id: app.subcategory_id ?? null,
      }
    }
  }

  const { error: createErr, data: newCert } = await createLicenseForAgency({ ...enrichedCertData, agencyId })
  if (createErr || !newCert?.id) return { error: createErr ?? 'Failed to create certification' }

  const supabaseAdmin = createAdminClient()
  const { error: linkErr } = await q.insertCertificationApplication(supabaseAdmin, {
    certification_id: newCert.id,
    application_id: applicationId,
    link_type: 'created_from',
    linked_by: session.user.id,
  })
  if (linkErr) return { error: linkErr.message }

  revalidateCertificationPages(agencyId)
  return { error: null }
}

/** Link an existing application to a certification (from the cert view). */
export async function linkProgramToCertification(
  certificationId: string,
  applicationId: string,
  agencyId: string,
  linkType: 'created_from' | 'renewal_of'
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const roleErr = assertCanManageCert(session.profile?.role)
  if (roleErr) return { error: roleErr }

  const supabaseAdmin = createAdminClient()
  const { error } = await q.insertCertificationApplication(supabaseAdmin, {
    certification_id: certificationId,
    application_id: applicationId,
    link_type: linkType,
    linked_by: session.user.id,
  })
  if (error) return { error: error.message }

  revalidateCertificationPages(agencyId)
  return { error: null }
}

/** Remove a program link from a certification. */
export async function unlinkProgramFromCertification(
  certificationId: string,
  applicationId: string,
  agencyId: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const roleErr = assertCanManageCert(session.profile?.role)
  if (roleErr) return { error: roleErr }

  const supabaseAdmin = createAdminClient()
  const { error } = await q.deleteCertificationApplication(supabaseAdmin, certificationId, applicationId)
  if (error) return { error: error.message }

  revalidateCertificationPages(agencyId)
  return { error: null }
}

/** Update editable certification fields. Allowed for admin, expert, and agency members. */
export async function updateCertificationDetails(
  certificationId: string,
  agencyId: string,
  data: Partial<{
    license_name: string
    license_number: string | null
    state: string | null
    activated_date: string | null
    expiry_date: string | null
    renewal_due_date: string | null
    issuing_body: string | null
    certification_category: string | null
    status: string
  }>
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const roleErr = assertCanManageCert(session.profile?.role)
  if (roleErr) return { error: roleErr }

  const supabaseAdmin = createAdminClient()
  const { error } = await q.updateLicenseById(supabaseAdmin, certificationId, {
    ...data,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  revalidateCertificationPages(agencyId)
  revalidatePath('/pages/agency/certifications')
  return { error: null }
}

/** Delete a license document record and its storage file. */
export async function deleteLicenseDocument(
  documentId: string,
  agencyId: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const roleErr = assertCanManageCert(session.profile?.role)
  if (roleErr) return { error: roleErr }

  const supabaseAdmin = createAdminClient()
  const { data: doc, error: fetchErr } = await q.getLicenseDocumentUrlById(supabaseAdmin, documentId)
  if (fetchErr || !doc) return { error: fetchErr?.message ?? 'Document not found' }

  const { error: storageErr } = await removeFiles(supabaseAdmin, 'application-documents', [doc.document_url])
  if (storageErr) console.error('[licenses/deleteLicenseDocument] Storage delete failed. docId=%s err=%s', documentId, storageErr.message)
  const { error } = await q.deleteLicenseDocumentById(supabaseAdmin, documentId)
  if (error) return { error: error.message }

  revalidateCertificationPages(agencyId)
  revalidatePath('/pages/agency/certifications')
  return { error: null }
}

/** Fetch programs available to link to a certification (not yet linked, agency-scoped). */
export async function getAvailableProgramsForCert(
  certificationId: string,
  agencyId: string
): Promise<{ error: string | null; data: { id: string; application_name: string; status: string; started_date: string | null }[] }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: [] }
  const roleErr = assertCanManageCert(session.profile?.role)
  if (roleErr) return { error: roleErr, data: [] }

  const supabaseAdmin = createAdminClient()
  const { data: linked } = await supabaseAdmin
    .from('certification_applications')
    .select('application_id')
    .eq('certification_id', certificationId)

  const excludeIds = (linked ?? []).map((r: { application_id: string }) => r.application_id)
  const { data, error } = await q.getAgencyApplicationsForLinking(supabaseAdmin, agencyId, excludeIds)
  if (error) return { error: error.message, data: [] }
  return { error: null, data: (data ?? []) as { id: string; application_name: string; status: string; started_date: string | null }[] }
}

type PriorVersion = {
  id: string
  license_name: string
  license_number: string | null
  status: string
  activated_date: string | null
  expiry_date: string | null
  previous_version_id: string | null
}

/** Traverse the previous_version_id chain to return all prior versions of a certification. */
export async function getCertificationVersionHistory(
  certificationId: string,
  agencyId: string
): Promise<{ error: string | null; data: PriorVersion[] }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: [] }
  const roleErr = assertCanManageCert(session.profile?.role)
  if (roleErr) return { error: roleErr, data: [] }

  const supabaseAdmin = createAdminClient()

  const { data: current } = await supabaseAdmin
    .from('licenses')
    .select('previous_version_id')
    .eq('id', certificationId)
    .single()

  if (!current?.previous_version_id) return { error: null, data: [] }

  const history: PriorVersion[] = []
  let nextId: string | null = current.previous_version_id
  let iterations = 0

  while (nextId && iterations < 20) {
    const { data: version, error } = await supabaseAdmin
      .from('licenses')
      .select('id, license_name, license_number, status, activated_date, expiry_date, previous_version_id')
      .eq('id', nextId)
      .eq('agency_id', agencyId)
      .single()

    if (error || !version) break
    history.push(version as PriorVersion)
    nextId = version.previous_version_id as string | null
    iterations++
  }

  return { error: null, data: history }
}

/** Update certification dates/status after a renewal cycle. */
export async function updateCertificationAfterRenewal(
  certificationId: string,
  agencyId: string,
  data: { expiry_date: string; renewal_due_date?: string; license_number?: string; status?: string }
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden' }

  const supabaseAdmin = createAdminClient()
  const { error } = await q.updateLicenseById(supabaseAdmin, certificationId, {
    ...data,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  revalidateCertificationPages(agencyId)
  return { error: null }
}
