import type { Supabase } from '../types'

/** Insert a license and return the created row. */
export async function insertLicenseReturning(
  supabase: Supabase,
  data: Record<string, unknown>
) {
  return supabase.from('licenses').insert(data).select().single()
}

/** Insert a license_document. */
export async function insertLicenseDocument(
  supabase: Supabase,
  data: Record<string, unknown>
) {
  return supabase.from('license_documents').insert(data)
}

/** Update license by id (e.g. expiry_date). */
export async function updateLicenseById(
  supabase: Supabase,
  licenseId: string,
  data: Record<string, unknown>
) {
  return supabase.from('licenses').update(data).eq('id', licenseId)
}

/** Get latest license_document by license_id (document_url, document_name). */
export async function getLatestLicenseDocumentByLicenseId(
  supabase: Supabase,
  licenseId: string
) {
  return supabase
    .from('license_documents')
    .select('document_url, document_name')
    .eq('license_id', licenseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
}

/** Get licenses by company_owner_id. */
export async function getLicensesByCompanyOwnerId(supabase: Supabase, companyOwnerId: string) {
  return supabase.from('licenses').select('*').eq('company_owner_id', companyOwnerId)
}

/** Get licenses by company_owner_id ordered by expiry_date asc. */
export async function getLicensesByCompanyOwnerIdOrdered(supabase: Supabase, companyOwnerId: string) {
  return supabase
    .from('licenses')
    .select('*')
    .eq('company_owner_id', companyOwnerId)
    .order('expiry_date', { ascending: true })
}

/** Get license_documents license_id (for document counts). */
export async function getLicenseDocumentLicenseIds(supabase: Supabase) {
  return supabase.from('license_documents').select('license_id')
}

/** Get license_documents by license ids (for document counts). */
export async function getLicenseDocumentsByLicenseIds(supabase: Supabase, licenseIds: string[]) {
  if (licenseIds.length === 0) return { data: [], error: null }
  return supabase.from('license_documents').select('license_id').in('license_id', licenseIds)
}

/** Get license by id. */
export async function getLicenseById(supabase: Supabase, licenseId: string) {
  return supabase.from('licenses').select('*').eq('id', licenseId).single()
}

/** Get license by id and company_owner_id (for dashboard detail). */
export async function getLicenseByIdAndOwner(supabase: Supabase, licenseId: string, companyOwnerId: string) {
  return supabase
    .from('licenses')
    .select('*')
    .eq('id', licenseId)
    .eq('company_owner_id', companyOwnerId)
    .single()
}

/** Get all licenses for an agency (agency-centric view for admin/expert). */
export async function getLicensesByAgencyId(supabase: Supabase, agencyId: string) {
  return supabase
    .from('licenses')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
}

/** Get licenses by agency_id ordered by expiry_date asc. */
export async function getLicensesByAgencyIdOrdered(supabase: Supabase, agencyId: string) {
  return supabase
    .from('licenses')
    .select('*')
    .eq('agency_id', agencyId)
    .order('expiry_date', { ascending: true })
}

/** Get license by id and agency_id (for detail page authorization). */
export async function getLicenseByIdAndAgencyId(supabase: Supabase, licenseId: string, agencyId: string) {
  return supabase
    .from('licenses')
    .select('*')
    .eq('id', licenseId)
    .eq('agency_id', agencyId)
    .single()
}

/** Get license_documents by license_id. */
export async function getLicenseDocumentsByLicenseId(supabase: Supabase, licenseId: string) {
  return supabase
    .from('license_documents')
    .select('*')
    .eq('license_id', licenseId)
    .order('created_at', { ascending: false })
}
