import type { PostgrestError } from '@supabase/supabase-js'
import type { Supabase } from '../types'
import type { PatientDocument } from './patients'

const USER_PROFILE_COLS = 'id, email, full_name, role, created_at, updated_at, phone, job_title, department, work_location, start_date, agency_id, is_active, last_login_at'

function caregiverMemberUpdateBlockedError(): PostgrestError {
  return {
    name: 'PostgrestError',
    message:
      'No rows were updated. If you are saving your own skills, apply the database migration that allows caregivers to update their own caregiver_members row, or ask an agency admin to update your profile.',
    code: 'PGRST116',
    details: '',
    hint: '',
  }
}

export async function updateUserProfileUpdatedAt(supabase: Supabase, userId: string) {
  return supabase.from('user_profiles').update({ updated_at: new Date().toISOString() }).eq('id', userId)
}

export async function getUserProfileEmail(supabase: Supabase, userId: string) {
  return supabase.from('user_profiles').select('email').eq('id', userId).single()
}

export async function rpcUpdateUserPassword(supabase: Supabase, userId: string, newPassword: string) {
  return supabase.rpc('update_user_password', { p_user_id: userId, p_new_password: newPassword })
}

export async function insertClient(
  supabase: Supabase,
  data: {
    user_id: string
    contact_name: string
    contact_email: string
    status: string
    agency_id?: string | null
  }
) {
  return supabase.from('agency_admins').insert({
    user_id: data.user_id,
    company_owner_id: data.user_id,
    contact_name: data.contact_name,
    contact_email: data.contact_email,
    status: data.status,
    agency_id: data.agency_id ?? null,
  })
}

export async function getStaffMemberByUserId(supabase: Supabase, userId: string) {
  return supabase.from('caregiver_members').select('id, agency_id, user_id').eq('user_id', userId).maybeSingle()
}

export async function insertStaffMember(
  supabase: Supabase,
  data: {
    user_id: string
    company_owner_id: string | null
    agency_id?: string | null
    first_name: string
    last_name: string
    email: string
    role: string
    status: string
  }
) {
  return supabase.from('caregiver_members').insert(data)
}

/** Insert staff member and return the created row. */
export async function insertStaffMemberReturning(
  supabase: Supabase,
  data: Record<string, unknown>
) {
  return supabase.from('caregiver_members').insert(data).select().single()
}

/**
 * Update staff member by id.
 * Uses `.select('id')` without `.single()` so PostgREST does not return **406** when RLS allows the
 * statement but updates 0 rows (`.single()` on 0 rows → 406 Not Acceptable). We treat an empty result
 * as an error so callers still know the update did not apply.
 */
export async function updateStaffMember(
  supabase: Supabase,
  staffId: string,
  data: Record<string, unknown>
) {
  const { data: rows, error } = await supabase
    .from('caregiver_members')
    .update(data)
    .eq('id', staffId)
    .select('id')

  if (error) return { data: null, error }
  const first = rows?.[0]
  if (!first) {
    return { data: null, error: caregiverMemberUpdateBlockedError() }
  }
  return { data: first, error: null }
}

/** Update user profile (full_name, role, updated_at). */
export async function updateUserProfile(
  supabase: Supabase,
  userId: string,
  data: { full_name?: string; role?: string; updated_at?: string }
) {
  return supabase.from('user_profiles').update(data).eq('id', userId)
}

/** Update user profile by id with arbitrary fields. */
export async function updateUserProfileById(
  supabase: Supabase,
  userId: string,
  data: Record<string, unknown>
) {
  return supabase.from('user_profiles').update(data).eq('id', userId)
}

/** Get licensing_expert id by user_id (for existence check). */
export async function getLicensingExpertIdByUserId(supabase: Supabase, userId: string) {
  return supabase.from('licensing_experts').select('id').eq('user_id', userId).maybeSingle()
}

export async function insertLicensingExpert(
  supabase: Supabase,
  data: {
    user_id: string
    first_name: string
    last_name: string
    email: string
    role: string
    status: string
  }
) {
  return supabase.from('licensing_experts').insert(data)
}

export async function getUserProfileByEmail(supabase: Supabase, email: string) {
  return supabase.from('user_profiles').select('id, role').eq('email', email).single()
}

export async function getCareCoordinatorByUserId(supabase: Supabase, userId: string) {
  return supabase
    .from('care_coordinators')
    .select('id, user_id, agency_id')
    .eq('user_id', userId)
    .maybeSingle()
}

export async function insertCareCoordinator(
  supabase: Supabase,
  data: { user_id: string; agency_id: string; first_name: string; last_name: string; email: string; status: string }
) {
  return supabase.from('care_coordinators').insert(data)
}

/** Get user profile by id (id, full_name, email). */
export async function getUserProfileById(supabase: Supabase, userId: string) {
  return supabase.from('user_profiles').select('id, full_name, email').eq('id', userId).single()
}

/** Get full user profile by id (all columns). */
export async function getUserProfileFull(supabase: Supabase, userId: string) {
  return supabase.from('user_profiles').select('*').eq('id', userId).single()
}

/** Get agency_id directly from user_profiles — works for all agency-scoped roles. */
export async function getAgencyIdFromProfile(supabase: Supabase, userId: string) {
  return supabase
    .from('user_profiles')
    .select('agency_id')
    .eq('id', userId)
    .maybeSingle()
}


/** Get staff members visible to an agency client (agency-wide with owner fallback). */
export async function getStaffMembersByAgencyOrCompanyOwner(
  supabase: Supabase,
  clientId: string,
  agencyId: string | null,
  options?: { status?: string }
) {
  let query = supabase
    .from('caregiver_members')
    .select('*')
    .order('created_at', { ascending: false })

  if (agencyId) {
    query = query.or(`company_owner_id.eq.${clientId},agency_id.eq.${agencyId}`)
  } else {
    query = query.eq('company_owner_id', clientId)
  }

  if (options?.status) query = query.eq('status', options.status)
  return query
}

/** Get one staff member visible to an agency client (agency-wide with owner fallback). */
export async function getStaffMemberByIdWithAgencyOrCompanyOwner(
  supabase: Supabase,
  staffId: string,
  clientId: string,
  agencyId: string | null
) {
  let query = supabase
    .from('caregiver_members')
    .select('*')
    .eq('id', staffId)

  if (agencyId) {
    query = query.or(`company_owner_id.eq.${clientId},agency_id.eq.${agencyId}`)
  } else {
    query = query.eq('company_owner_id', clientId)
  }

  return query.maybeSingle()
}

/** Get staff members by agency_id (optional status filter), ordered by created_at desc. */
export async function getStaffMembersByAgencyId(
  supabase: Supabase,
  agencyId: string,
  options?: { status?: string }
) {
  let query = supabase
    .from('caregiver_members')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (options?.status) query = query.eq('status', options.status)
  return query
}

export interface GetStaffMembersPaginatedOpts {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  role?: string
}

/** Paginated, filtered staff members for an agency. */
export async function getStaffMembersByAgencyIdPaginated(
  supabase: Supabase,
  agencyId: string,
  opts?: GetStaffMembersPaginatedOpts
) {
  const page     = opts?.page     ?? 0
  const pageSize = opts?.pageSize ?? 50
  const from     = page * pageSize
  const to       = from + pageSize - 1

  let dataQuery  = supabase.from('caregiver_members').select('*').eq('agency_id', agencyId).order('created_at', { ascending: false }).range(from, to)
  let countQuery = supabase.from('caregiver_members').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId)

  if (opts?.search?.trim()) {
    const term = `%${opts.search.trim()}%`
    dataQuery  = dataQuery.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},employee_id.ilike.${term}`)
    countQuery = countQuery.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},employee_id.ilike.${term}`)
  }

  if (opts?.status && opts.status !== 'all') {
    dataQuery  = dataQuery.eq('status', opts.status)
    countQuery = countQuery.eq('status', opts.status)
  }

  if (opts?.role && opts.role !== 'all') {
    dataQuery  = dataQuery.eq('role', opts.role)
    countQuery = countQuery.eq('role', opts.role)
  }

  const [dataResult, countResult] = await Promise.all([dataQuery, countQuery])
  return {
    data:  dataResult.data  ?? [],
    count: countResult.count ?? 0,
    error: dataResult.error ?? countResult.error,
  }
}

/** Get one staff member by id scoped to agency_id. */
export async function getStaffMemberByIdAndAgencyId(
  supabase: Supabase,
  staffId: string,
  agencyId: string
) {
  return supabase
    .from('caregiver_members')
    .select('*')
    .eq('id', staffId)
    .eq('agency_id', agencyId)
    .maybeSingle()
}

/** Get user profile role by id. */
export async function getUserProfileRoleById(supabase: Supabase, userId: string) {
  return supabase.from('user_profiles').select('role').eq('id', userId).single()
}

/** Get user profiles by ids (optional select, default id, full_name, role). */
export async function getUserProfilesByIds(
  supabase: Supabase,
  userIds: string[],
  select = 'id, full_name, role'
) {
  if (userIds.length === 0) return { data: [], error: null }
  return supabase.from('user_profiles').select(select).in('id', userIds)
}

/** Get all user profiles ordered by full_name. */
export async function getUserProfilesOrdered(supabase: Supabase) {
  return supabase.from('user_profiles').select(USER_PROFILE_COLS).order('full_name', { ascending: true })
}

/** Get all user profiles ordered by created_at desc. */
export async function getUserProfilesOrderedByCreatedAt(supabase: Supabase) {
  return supabase.from('user_profiles').select(USER_PROFILE_COLS).order('created_at', { ascending: false })
}

/** Get user profiles by role, ordered by created_at desc. */
export async function getUserProfilesByRole(supabase: Supabase, role: string, select = '*') {
  return supabase
    .from('user_profiles')
    .select(select)
    .eq('role', role)
    .order('created_at', { ascending: false })
}

/** Get staff members by user_ids (e.g. user_id, agency_id, company_owner_id). */
export async function getStaffMembersByUserIds(
  supabase: Supabase,
  userIds: string[],
  select = 'user_id, agency_id, company_owner_id'
) {
  if (userIds.length === 0) return { data: [], error: null }
  return supabase.from('caregiver_members').select(select).in('user_id', userIds)
}

export async function getCareCoordinatorsByUserIds(
  supabase: Supabase,
  userIds: string[],
  select = 'user_id, agency_id'
) {
  if (userIds.length === 0) return { data: [], error: null }
  return supabase.from('care_coordinators').select(select).in('user_id', userIds)
}

/** Get staff members with agency_id not null and status active. */
export async function getStaffMembersWithAgencyActive(supabase: Supabase) {
  return supabase
    .from('caregiver_members')
    .select('*')
    .not('agency_id', 'is', null)
    .eq('status', 'active')
    .limit(2000)
}

/** Get first admin user id (for client messages adminUserId). */
export async function getFirstAdminUserId(supabase: Supabase) {
  return supabase
    .from('user_profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()
}

/**
 * Update caregiver_members.documents JSONB.
 * Must use .select().single() so PostgREST returns an error when RLS blocks the update (0 rows);
 * without SELECT, update() returns { error: null } even when nothing was saved.
 */
export async function updateStaffMemberDocuments(
  supabase: Supabase,
  staffMemberId: string,
  documents: PatientDocument[]
) {
  return supabase
    .from('caregiver_members')
    .update({ documents })
    .eq('id', staffMemberId)
    .select('id, documents')
    .single()
}
