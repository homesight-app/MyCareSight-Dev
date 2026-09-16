'use server'

import { getSession } from '@/lib/auth'
import { formatDate } from '@/lib/format-date'
import sql from '@/db'

type ReportCaregiverScope =
  | { mode: 'ownerOnly'; adminId: string }
  | { mode: 'agency'; adminId: string; agencyId: string }

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

async function resolveReportCaregiverScope(userId: string): Promise<ReportCaregiverScope | null> {
  const [admin] = await sql<{ id: string; agency_id: string | null }[]>`
    SELECT id, agency_id FROM agency_admins WHERE user_id = ${userId} LIMIT 1
  `
  if (admin?.id) {
    if (admin.agency_id) return { mode: 'agency', adminId: admin.id, agencyId: admin.agency_id }
    return { mode: 'ownerOnly', adminId: admin.id }
  }

  const [coord] = await sql<{ agency_id: string | null }[]>`
    SELECT agency_id FROM care_coordinators WHERE user_id = ${userId} LIMIT 1
  `
  if (!coord?.agency_id) return null

  const [primaryAdmin] = await sql<{ id: string }[]>`
    SELECT id FROM agency_admins WHERE agency_id = ${coord.agency_id} ORDER BY created_at ASC LIMIT 1
  `
  if (!primaryAdmin?.id) return null
  return { mode: 'agency', adminId: primaryAdmin.id, agencyId: coord.agency_id }
}

async function queryStaffForCertificationsReport(scope: ReportCaregiverScope): Promise<ReportCaregiverMemberRow[]> {
  if (scope.mode === 'ownerOnly') {
    return sql<ReportCaregiverMemberRow[]>`
      SELECT id, first_name, last_name, email, phone, user_id
      FROM caregiver_members
      WHERE company_owner_id = ${scope.adminId}
      ORDER BY first_name ASC
    `
  }
  return sql<ReportCaregiverMemberRow[]>`
    SELECT id, first_name, last_name, email, phone, user_id
    FROM caregiver_members
    WHERE company_owner_id = ${scope.adminId} OR agency_id = ${scope.agencyId}
    ORDER BY first_name ASC
  `
}

async function queryStaffForRosterReport(scope: ReportCaregiverScope): Promise<ReportCaregiverMemberRow[]> {
  if (scope.mode === 'ownerOnly') {
    return sql<ReportCaregiverMemberRow[]>`
      SELECT id, first_name, last_name, email, phone, role, job_title, status
      FROM caregiver_members
      WHERE company_owner_id = ${scope.adminId}
      ORDER BY first_name ASC
    `
  }
  return sql<ReportCaregiverMemberRow[]>`
    SELECT id, first_name, last_name, email, phone, role, job_title, status
    FROM caregiver_members
    WHERE company_owner_id = ${scope.adminId} OR agency_id = ${scope.agencyId}
    ORDER BY first_name ASC
  `
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

type CredentialRow = {
  id: string
  caregiver_member_id: string | null
  user_id: string | null
  source_credential_name: string | null
  credential_number: string | null
  state: string | null
  issuing_authority: string | null
  issue_date: string | null
  expiration_date: string | null
  status: string | null
  document_url: string | null
}

export async function getStaffCertificationsReport() {
  try {
    const session = await getSession()
    if (!session) return { error: 'You must be logged in', data: null }

    const scope = await resolveReportCaregiverScope(session.user.id)
    if (!scope) return { error: null, data: [] }

    const members = await queryStaffForCertificationsReport(scope)
    if (members.length === 0) return { error: null, data: [] }

    const staffIds = members.map(m => m.id)
    const credentials = await sql<CredentialRow[]>`
      SELECT id, caregiver_member_id, user_id, source_credential_name, credential_number,
             state, issuing_authority, issue_date, expiration_date, status, document_url
      FROM caregiver_credentials
      WHERE caregiver_member_id = ANY(${staffIds}::uuid[])
      ORDER BY expiration_date ASC
    `

    const staffMap = new Map(members.map(m => [m.user_id, m]))
    const staffById = new Map(members.map(m => [m.id, m]))

    const today = new Date()
    const reportData: StaffCertificationReportRow[] = credentials.map(cert => {
      const staff =
        (cert.user_id ? staffMap.get(cert.user_id) : undefined) ??
        (cert.caregiver_member_id ? staffById.get(cert.caregiver_member_id) : undefined)
      const expStr = cert.expiration_date
      const expiry = expStr ? new Date(expStr) : today
      const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      let status: 'Active' | 'Expiring Soon' | 'Expired'
      if (!expStr || daysUntilExpiry <= 0 || cert.status === 'Expired') {
        status = 'Expired'
      } else if (daysUntilExpiry <= 90) {
        status = 'Expiring Soon'
      } else {
        status = 'Active'
      }

      return {
        staff_name: staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown Staff',
        contact: staff ? `${staff.email} ${staff.phone ? `(${staff.phone})` : ''}`.trim() : 'N/A',
        certification: cert.source_credential_name ?? 'Credential',
        cert_number: cert.credential_number ?? '',
        state: cert.state ?? 'N/A',
        issuing_authority: cert.issuing_authority ?? 'N/A',
        issue_date: formatDate(cert.issue_date),
        expiration: formatDate(expStr),
        status,
        certification_id: cert.id,
        document_url: cert.document_url,
      }
    })

    return { error: null, data: reportData }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch report data', data: null }
  }
}

export async function getExpiringCertificationsReport() {
  try {
    const session = await getSession()
    if (!session) return { error: 'You must be logged in', data: null }

    const scope = await resolveReportCaregiverScope(session.user.id)
    if (!scope) return { error: null, data: [] }

    const members = await queryStaffForCertificationsReport(scope)
    if (members.length === 0) return { error: null, data: [] }

    const staffIds = members.map(m => m.id)
    const credentials = await sql<CredentialRow[]>`
      SELECT id, caregiver_member_id, user_id, source_credential_name, credential_number,
             expiration_date, status, document_url
      FROM caregiver_credentials
      WHERE caregiver_member_id = ANY(${staffIds}::uuid[])
      ORDER BY expiration_date ASC
    `

    const staffMap = new Map(members.map(m => [m.user_id, m]))
    const staffById = new Map(members.map(m => [m.id, m]))

    const today = new Date()

    const reportData: ExpiringCertificationReportRow[] = credentials
      .filter(cert => {
        const expStr = cert.expiration_date
        if (!expStr) return cert.status === 'Expired'
        const daysUntilExpiry = Math.ceil((new Date(expStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntilExpiry <= 90 || cert.status === 'Expired'
      })
      .map(cert => {
        const staff =
          (cert.user_id ? staffMap.get(cert.user_id) : undefined) ??
          (cert.caregiver_member_id ? staffById.get(cert.caregiver_member_id) : undefined)
        const expStr = cert.expiration_date ?? ''
        const daysUntilExpiry = expStr
          ? Math.ceil((new Date(expStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          : -1

        const status: 'Expiring Soon' | 'Expired' =
          daysUntilExpiry <= 0 || cert.status === 'Expired' ? 'Expired' : 'Expiring Soon'

        return {
          staff_name: staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown Staff',
          contact: staff ? `${staff.email} ${staff.phone ? `(${staff.phone})` : ''}`.trim() : 'N/A',
          certification: cert.source_credential_name ?? 'Credential',
          cert_number: cert.credential_number ?? '',
          expiration: formatDate(expStr || null),
          status,
          certification_id: cert.id,
          document_url: cert.document_url,
        }
      })

    return { error: null, data: reportData }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch report data', data: null }
  }
}

export async function getStaffRosterReport() {
  try {
    const session = await getSession()
    if (!session) return { error: 'You must be logged in', data: null }

    const scope = await resolveReportCaregiverScope(session.user.id)
    if (!scope) return { error: null, data: [] }

    const members = await queryStaffForRosterReport(scope)
    if (members.length === 0) return { error: null, data: [] }

    const reportData: StaffRosterReportRow[] = members.map(staff => ({
      staff_name: `${staff.first_name} ${staff.last_name}`,
      email: staff.email ?? '',
      phone: staff.phone || 'N/A',
      role: staff.role || '—',
      job_title: staff.job_title || '—',
      status: staff.status || '—',
    }))

    return { error: null, data: reportData }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch report data', data: null }
  }
}
