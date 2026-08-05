import type { Supabase } from '../types'

const patientListInsertSelect = `
  *,
  patients_representatives (
    id,
    name,
    relationship,
    phone_number,
    email_address
  )
`

/** Insert a patient and return the new row shaped like agency client list reads (with representatives). */
export async function insertPatient(
  supabase: Supabase,
  data: Record<string, unknown>
) {
  return supabase.from('patients').insert(data).select(patientListInsertSelect).single()
}

/** Get patients by owner_id. */
export async function getPatientsByOwnerId(supabase: Supabase, ownerId: string) {
  return supabase
  .from('patients')
  .select(`
    *,
    patients_representatives (
      id,
      name,
      relationship,
      phone_number,
      email_address
    )
  `)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1000)
}

/** Get patients by owner_id list (agency-wide), ordered by created_at desc. */
export async function getPatientsByOwnerIds(supabase: Supabase, ownerIds: string[]) {
  if (ownerIds.length === 0) return { data: [], error: null }
  return supabase
    .from('patients')
    .select(`
    *,
    patients_representatives (
      id,
      name,
      relationship,
      phone_number,
      email_address
    )
  `)
    .in('owner_id', ownerIds)
    .order('created_at', { ascending: false })
    .limit(1000)
}

export type GetPatientsByAgencyIdOpts = {
  page?: number
  pageSize?: number
  search?: string
  status?: string
}

/** Get patients by agency_id with optional server-side pagination, search, and status filter.
 *  Uses a separate head-only count query because Supabase returns null for count on join selects. */
export async function getPatientsByAgencyId(
  supabase: Supabase,
  agencyId: string,
  opts?: GetPatientsByAgencyIdOpts
) {
  const page     = opts?.page     ?? 0
  const pageSize = opts?.pageSize ?? 50
  const from = page * pageSize
  const to   = from + pageSize - 1

  const orFilter = opts?.search?.trim()
    ? `first_name.ilike.%${opts.search.trim()}%,last_name.ilike.%${opts.search.trim()}%,email_address.ilike.%${opts.search.trim()}%,phone_number.ilike.%${opts.search.trim()}%`
    : null

  let dataQuery = supabase
    .from('patients')
    .select(`*, patients_representatives ( id, name, relationship, phone_number, email_address )`)
    .eq('agency_id', agencyId)
    .order('status',     { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  let countQuery = supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId)

  if (orFilter) {
    dataQuery  = dataQuery.or(orFilter)
    countQuery = countQuery.or(orFilter)
  }
  if (opts?.status && opts.status !== 'all') {
    dataQuery  = dataQuery.eq('status', opts.status)
    countQuery = countQuery.eq('status', opts.status)
  }

  const [dataResult, countResult] = await Promise.all([dataQuery, countQuery])
  return {
    data:  dataResult.data,
    count: countResult.count,
    error: dataResult.error ?? countResult.error,
  }
}

/** Get total + active patient counts for an agency (head-only, no rows fetched). */
export async function getPatientCountsByAgencyId(supabase: Supabase, agencyId: string) {
  const [totalRes, activeRes] = await Promise.all([
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId),
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .eq('status', 'active'),
  ])
  return { total: totalRes.count ?? 0, active: activeRes.count ?? 0 }
}

/** Update patient status by id. */
export async function updatePatientStatus(
  supabase: Supabase,
  patientId: string,
  status: string
) {
  return supabase.from('patients').update({ status }).eq('id', patientId)
}

/** Update patient login_access by id. */
export async function updatePatientLoginAccess(
  supabase: Supabase,
  patientId: string,
  loginAccess: boolean
) {
  return supabase.from('patients').update({ login_access: loginAccess }).eq('id', patientId)
}

/** Update patient fields (e.g. personal info) by id. */
export async function updatePatient(
  supabase: Supabase,
  patientId: string,
  data: { first_name?: string; last_name?: string; gender?: string | null; date_of_birth?: string }
) {
  return supabase.from('patients').update(data).eq('id', patientId)
}

/** Update patient medical fields by id. */
export async function updatePatientMedical(
  supabase: Supabase,
  patientId: string,
  data: { primary_diagnosis?: string | null; current_medications?: string | null; allergies?: string | null }
) {
  return supabase.from('patients').update(data).eq('id', patientId)
}

/** Document item stored in patients.documents JSONB. */
export type PatientDocument = {
  id: string
  name: string
  path: string
  url?: string
  uploaded_at: string
  size?: number
}

/** Update patient documents (JSONB array). Returns updated row or error. */
export async function updatePatientDocuments(
  supabase: Supabase,
  patientId: string,
  documents: PatientDocument[]
) {
  return supabase
    .from('patients')
    .update({ documents })
    .eq('id', patientId)
    .select()
    .single()
}

/** Get patient by id and owner_id (for detail page). */
export async function getPatientByIdAndOwnerId(
  supabase: Supabase,
  patientId: string,
  ownerId: string
) {
  return supabase
  .from('patients')
  .select(`
    *,
    patients_representatives (
      id,
      name,
      relationship,
      phone_number,
      email_address
    )
  `)
    .eq('id', patientId)
    .eq('owner_id', ownerId)
    
    .single()
}

/** Get patient by id and owner_id list (agency-wide detail page access). */
export async function getPatientByIdAndOwnerIds(
  supabase: Supabase,
  patientId: string,
  ownerIds: string[]
) {
  if (ownerIds.length === 0) return { data: null, error: null }
  return supabase
    .from('patients')
    .select(`
    *,
    patients_representatives (
      id,
      name,
      relationship,
      phone_number,
      email_address
    )
  `)
    .eq('id', patientId)
    .in('owner_id', ownerIds)
    .maybeSingle()
}

/** Get patient by id and agency_id (agency-wide detail page access). */
export async function getPatientByIdAndAgencyId(
  supabase: Supabase,
  patientId: string,
  agencyId: string
) {
  return supabase
    .from('patients')
    .select(`
    *,
    patients_representatives (
      id,
      name,
      relationship,
      phone_number,
      email_address
    )
  `)
    .eq('id', patientId)
    .eq('agency_id', agencyId)
    .maybeSingle()
}

/** Get patients by owner_id (id, first_name, last_name) for lists/navigation, ordered by last_name. */
export async function getPatientsByOwnerIdMinimal(supabase: Supabase, ownerId: string) {
  return supabase
    .from('patients')
    .select('id, first_name, last_name')
    .eq('owner_id', ownerId)
    .order('last_name', { ascending: true })
}

/** Get patients by owner_id list (id, first_name, last_name), ordered by last_name. */
export async function getPatientsByOwnerIdsMinimal(supabase: Supabase, ownerIds: string[]) {
  if (ownerIds.length === 0) return { data: [], error: null }
  return supabase
    .from('patients')
    .select('id, first_name, last_name')
    .in('owner_id', ownerIds)
    .order('last_name', { ascending: true })
}

/** Get patients by agency_id (id, first_name, last_name), ordered by last_name. */
export async function getPatientsByAgencyIdMinimal(supabase: Supabase, agencyId: string) {
  return supabase
    .from('patients')
    .select('id, first_name, last_name')
    .eq('agency_id', agencyId)
    .order('last_name', { ascending: true })
}
