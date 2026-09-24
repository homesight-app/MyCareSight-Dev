import { readCaregiverPayRates } from '@/lib/repositories/caregiver-pay-rates'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { readAgencyCaregiverDashboardStats } from '@/lib/repositories/agency-caregiver-dashboard'
import * as q from '@/lib/supabase/query'
import StaffManagementClient from '@/components/StaffManagementClient'
import FeatureGate from '@/components/FeatureGate'

const PAGE_SIZE = 50

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; role?: string; status?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const { data: staffRolesData } = await q.getConfigurationValuesWithSubcategories('STAFF_ROLE')

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  const role = session!.profile?.role ?? ''
  const canManageNotes = role === 'company_owner' || role === 'care_coordinator'
  const staffRoleNames = (staffRolesData ?? []).map((r: { name?: string }) => r.name).filter(Boolean) as string[]

  const params       = await searchParams
  const page         = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search       = params.q ?? ''
  const roleFilter   = params.role ?? 'all'
  const statusFilter = params.status ?? 'all'

  if (!agencyId) {
    return (
      <StaffManagementClient
        staffMembers={[]}
        licensesByStaff={{}}
        totalStaff={0}
        activeStaff={0}
        expiringLicenses={0}
        staffWithExpiringLicenses={[]}
        staffRoleNames={staffRoleNames}
        canManageNotes={canManageNotes}
        totalCount={0}
        page={0}
        pageSize={PAGE_SIZE}
        initialSearch=""
        initialRole="all"
        initialStatus="all"
      />
    )
  }

  const [staffResult, statsResult] = await Promise.all([
    q.getStaffMembersByAgencyIdPaginated(agencyId, { page, pageSize: PAGE_SIZE, search, status: statusFilter, role: roleFilter }),
    readAgencyCaregiverDashboardStats(agencyId),
  ])
  const stats = statsResult.data ?? { totalStaff: 0, activeStaff: 0, expiringLicenses: 0 }

  const staffMembers = staffResult.data ?? []
  const staffMemberIds = staffMembers.map((s) => s.id)
  const todayYmd = new Date().toISOString().slice(0, 10)

  const [{ data: currentEffectivePayRates }, { data: allStaffLicensesData }] = await Promise.all([
    staffMemberIds.length > 0
      ? readCaregiverPayRates({ caregiverIds: staffMemberIds, agencyId, effectiveOn: todayYmd })
      : Promise.resolve({ data: [] as { caregiver_member_id: string; pay_rate: number; service_type: string | null; effective_start: string }[], error: null }),
    staffMemberIds.length > 0
      ? q.getStaffLicensesByStaffMemberIds(staffMemberIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const currentPayRateByCaregiverId = new Map<string, number>()
  const byCaregiver = new Map<string, typeof currentEffectivePayRates>()
  for (const row of currentEffectivePayRates ?? []) {
    const id = String((row as { caregiver_member_id: string }).caregiver_member_id)
    const existing = byCaregiver.get(id) ?? []
    existing.push(row)
    byCaregiver.set(id, existing)
  }
  byCaregiver.forEach((rows, caregiverId) => {
    const sorted = [...(rows ?? [])].sort((a, b) => {
      const sa = String((a as { effective_start?: string | null }).effective_start ?? '')
      const sb = String((b as { effective_start?: string | null }).effective_start ?? '')
      return sb.localeCompare(sa)
    })
    const defaultBand = sorted.find((r) => (r as { service_type?: string | null }).service_type == null)
    const chosen = defaultBand ?? sorted[0]
    const n = Number((chosen as { pay_rate?: number | null }).pay_rate ?? NaN)
    if (Number.isFinite(n)) currentPayRateByCaregiverId.set(caregiverId, n)
  })

  const allStaffLicenses =
    allStaffLicensesData?.map((license) => ({
      id: license.id,
      caregiver_member_id: license.caregiver_member_id,
      license_type: license.license_type,
      license_number: license.license_number || 'N/A',
      state: license.state,
      status: license.status,
      expiry_date: license.expiry_date,
      days_until_expiry: license.days_until_expiry,
    })) ?? []

  const licensesByStaff = allStaffLicenses.reduce(
    (acc: Record<string, typeof allStaffLicenses>, license) => {
      const sid = license.caregiver_member_id
      if (!acc[sid]) acc[sid] = []
      acc[sid].push(license)
      return acc
    },
    {}
  )

  const staffWithExpiringLicenses = staffMembers.map((staff) => {
    const licenses = licensesByStaff[staff.id] ?? []
    const expiringCount = licenses.filter(
      (l) => l.days_until_expiry != null && l.days_until_expiry <= 30 && l.days_until_expiry > 0
    ).length
    const pr = currentPayRateByCaregiverId.get(staff.id)
    return { ...staff, expiringLicensesCount: expiringCount, currentPayRate: pr ?? null }
  })

  return (
    <FeatureGate feature="caregivers" agencyId={agencyId}>
      <StaffManagementClient
        staffMembers={staffMembers}
        licensesByStaff={licensesByStaff}
        totalStaff={stats.totalStaff}
        activeStaff={stats.activeStaff}
        expiringLicenses={stats.expiringLicenses}
        staffWithExpiringLicenses={staffWithExpiringLicenses}
        staffRoleNames={staffRoleNames}
        canManageNotes={canManageNotes}
        agencyId={agencyId ?? undefined}
        totalCount={staffResult.count}
        page={page}
        pageSize={PAGE_SIZE}
        initialSearch={search}
        initialRole={roleFilter}
        initialStatus={statusFilter}
      />
    </FeatureGate>
  )
}
