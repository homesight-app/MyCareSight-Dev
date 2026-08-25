'use server'

import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format-date'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

/** Agency admin: own admin row. Care coordinator: primary agency admin for coordinator's agency. */
type ReportCaregiverScope =
  | { mode: 'ownerOnly'; adminId: string }
  | { mode: 'agency'; adminId: string; agencyId: string }

/** Dynamic `.select(...)` strings are not narrowed by Supabase types; use this after `error` is cleared. */
type ReportCaregiverMemberRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  user_id?: string | null
  role?: string | null
  job_title?: string | null
  status?: string | null
}

async function resolveReportCaregiverScope(
  supabase: ServerSupabase,
  userId: string
): Promise<ReportCaregiverScope | null> {
  const { data: admin } = await supabase
    .from('agency_admins')
    .select('id, agency_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (admin?.id) {
    if (admin.agency_id) return { mode: 'agency', adminId: admin.id, agencyId: admin.agency_id }
    return { mode: 'ownerOnly', adminId: admin.id }
  }

  const { data: coord } = await supabase
    .from('care_coordinators')
    .select('agency_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!coord?.agency_id) return null

  const { data: primaryAdmin } = await supabase
    .from('agency_admins')
    .select('id')
    .eq('agency_id', coord.agency_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!primaryAdmin?.id) return null
  return { mode: 'agency', adminId: primaryAdmin.id, agencyId: coord.agency_id }
}

async function queryCaregiverMembersForReport(
  supabase: ServerSupabase,
  scope: ReportCaregiverScope,
  select: string
) {
  let q = supabase.from('caregiver_members').select(select).order('first_name', { ascending: true })
  if (scope.mode === 'ownerOnly') {
    q = q.eq('company_owner_id', scope.adminId)
  } else {
    q = q.or(`company_owner_id.eq.${scope.adminId},agency_id.eq.${scope.agencyId}`)
  }
  return q
}

export interface StaffCertificationReportRow {
  staff_name: string
  contact: string
  certification: string
  cert_number: string
  state: string
  issuing_authority: string
  issue_date: string
  expiration: string
  status: 'Active' | 'Expiring Soon' | 'Expired'
  certification_id?: string
  document_url: string | null
}

export interface ExpiringCertificationReportRow {
  staff_name: string
  contact: string
  certification: string
  cert_number: string
  expiration: string
  status: 'Expiring Soon' | 'Expired'
  certification_id?: string
  document_url: string | null
}

export interface StaffRosterReportRow {
  staff_name: string
  email: string
  phone: string
  role: string
  job_title: string
  status: string
}

export async function getStaffCertificationsReport() {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: 'You must be logged in', data: null }
    }

    const scope = await resolveReportCaregiverScope(supabase, user.id)
    if (!scope) {
      return { error: null, data: [] }
    }

    const { data: staffMembers, error: staffError } = await queryCaregiverMembersForReport(
      supabase,
      scope,
      'id, first_name, last_name, email, phone, user_id'
    )

    if (staffError) {
      return { error: staffError.message, data: null }
    }

    if (!staffMembers || staffMembers.length === 0) {
      return { error: null, data: [] }
    }

    const members = staffMembers as unknown as ReportCaregiverMemberRow[]
    const staffIds = members.map((sm) => sm.id)

    const { data: credentials, error: certError } = await supabase
      .from('caregiver_credentials')
      .select('*')
      .in('caregiver_member_id', staffIds)
      .order('expiration_date', { ascending: true })

    if (certError) {
      return { error: certError.message, data: null }
    }

    const staffMap = new Map<string | null | undefined, ReportCaregiverMemberRow>(members.map((sm) => [sm.user_id, sm]))
    const staffById = new Map(members.map((sm) => [sm.id, sm]))

    const reportData: StaffCertificationReportRow[] = (credentials || []).map((cert) => {
      const staff =
        (cert.user_id ? staffMap.get(cert.user_id as string) : undefined) ??
        (cert.caregiver_member_id ? staffById.get(cert.caregiver_member_id as string) : undefined)
      const expStr = cert.expiration_date as string | null
      const today = new Date()
      const expiry = expStr ? new Date(expStr) : today
      const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      let status: 'Active' | 'Expiring Soon' | 'Expired'
      const st = String(cert.status || '')
      if (!expStr || daysUntilExpiry <= 0 || st === 'Expired') {
        status = 'Expired'
      } else if (daysUntilExpiry <= 90) {
        status = 'Expiring Soon'
      } else {
        status = 'Active'
      }

      const staffName = staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown Staff'

      const contact = staff ? `${staff.email} ${staff.phone ? `(${staff.phone})` : ''}` : 'N/A'

      return {
        staff_name: staffName,
        contact: contact.trim(),
        certification: (cert.source_credential_name as string) || 'Credential',
        cert_number: (cert.credential_number as string) || '',
        state: (cert.state as string) || 'N/A',
        issuing_authority: (cert.issuing_authority as string) || 'N/A',
        issue_date: formatDate(cert.issue_date as string | null),
        expiration: formatDate(expStr),
        status,
        certification_id: cert.id as string,
        document_url: cert.document_url as string | null,
      }
    })

    return { error: null, data: reportData }
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch report data', data: null }
  }
}

export async function getExpiringCertificationsReport() {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: 'You must be logged in', data: null }
    }

    const scope = await resolveReportCaregiverScope(supabase, user.id)
    if (!scope) {
      return { error: null, data: [] }
    }

    const { data: staffMembers, error: staffError } = await queryCaregiverMembersForReport(
      supabase,
      scope,
      'id, first_name, last_name, email, phone, user_id'
    )

    if (staffError) {
      return { error: staffError.message, data: null }
    }

    if (!staffMembers || staffMembers.length === 0) {
      return { error: null, data: [] }
    }

    const members = staffMembers as unknown as ReportCaregiverMemberRow[]
    const staffIds = members.map((sm) => sm.id)

    const { data: credentials, error: certError } = await supabase
      .from('caregiver_credentials')
      .select('*')
      .in('caregiver_member_id', staffIds)
      .order('expiration_date', { ascending: true })

    if (certError) {
      return { error: certError.message, data: null }
    }

    const staffMap = new Map<string | null | undefined, ReportCaregiverMemberRow>(members.map((sm) => [sm.user_id, sm]))
    const staffById = new Map(members.map((sm) => [sm.id, sm]))

    const today = new Date()

    const reportData: ExpiringCertificationReportRow[] = (credentials || [])
      .filter((cert) => {
        const expStr = cert.expiration_date as string | null
        if (!expStr) return String(cert.status || '') === 'Expired'
        const expiry = new Date(expStr)
        const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntilExpiry <= 90 || cert.status === 'Expired'
      })
      .map((cert) => {
        const staff =
          (cert.user_id ? staffMap.get(cert.user_id as string) : undefined) ??
          (cert.caregiver_member_id ? staffById.get(cert.caregiver_member_id as string) : undefined)
        const expStr = cert.expiration_date as string
        const expiry = new Date(expStr)
        const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        let status: 'Expiring Soon' | 'Expired'
        if (daysUntilExpiry <= 0 || cert.status === 'Expired') {
          status = 'Expired'
        } else {
          status = 'Expiring Soon'
        }

        const staffName = staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown Staff'

        const contact = staff ? `${staff.email} ${staff.phone ? `(${staff.phone})` : ''}` : 'N/A'

        return {
          staff_name: staffName,
          contact: contact.trim(),
          certification: (cert.source_credential_name as string) || 'Credential',
          cert_number: (cert.credential_number as string) || '',
          expiration: formatDate(expStr),
          status,
          certification_id: cert.id as string,
          document_url: cert.document_url as string | null,
        }
      })

    return { error: null, data: reportData }
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch report data', data: null }
  }
}

export async function getStaffRosterReport() {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: 'You must be logged in', data: null }
    }

    const scope = await resolveReportCaregiverScope(supabase, user.id)
    if (!scope) {
      return { error: null, data: [] }
    }

    const { data: staffMembers, error: staffError } = await queryCaregiverMembersForReport(
      supabase,
      scope,
      'id, first_name, last_name, email, phone, role, job_title, status'
    )

    if (staffError) {
      return { error: staffError.message, data: null }
    }

    if (!staffMembers || staffMembers.length === 0) {
      return { error: null, data: [] }
    }

    const rosterRows = staffMembers as unknown as ReportCaregiverMemberRow[]
    const reportData: StaffRosterReportRow[] = rosterRows.map((staff) => ({
      staff_name: `${staff.first_name} ${staff.last_name}`,
      email: staff.email ?? '',
      phone: staff.phone || 'N/A',
      role: staff.role || '—',
      job_title: staff.job_title || '—',
      status: staff.status || '—',
    }))

    return { error: null, data: reportData }
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch report data', data: null }
  }
}
