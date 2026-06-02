import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import StaffManagementClient from '@/components/StaffManagementClient'
export default async function StaffPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()
  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  const [{ count: unreadNotifications }, { data: up }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, session.user.id),
    q.getAgencyIdFromProfile(supabase, session.user.id),
  ])
  const agencyId = up?.agency_id ?? null
  const role = session.profile?.role ?? ''
  const canManageNotes =
    role === 'agency_admin' || role === 'company_owner' || role === 'care_coordinator'

  const { data: staffMembersData } = agencyId
    ? await q.getStaffMembersByAgencyId(supabase, agencyId)
    : { data: [] }
  const staffMembers = staffMembersData ?? []

  const { data: staffRolesData } = await q.getStaffRoles(supabase)
  const staffRoleNames = (staffRolesData ?? []).map((role: { name?: string }) => role.name).filter(Boolean) as string[]

  const staffMemberIds = staffMembers.map((s) => s.id)
  const todayYmd = new Date().toISOString().slice(0, 10)

  const { data: currentEffectivePayRates } =
    staffMemberIds.length > 0
      ? await supabase
          .from('caregiver_pay_rates')
          .select('caregiver_member_id, pay_rate, service_type, effective_start')
          .in('caregiver_member_id', staffMemberIds)
          .lte('effective_start', todayYmd)
          .or(`effective_end.is.null,effective_end.gt.${todayYmd}`)
      : {
          data: [] as {
            caregiver_member_id: string
            pay_rate: number
            service_type: string | null
            effective_start: string
          }[],
        }

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
    if (Number.isFinite(n)) {
      currentPayRateByCaregiverId.set(caregiverId, n)
    }
  })

  const { data: allStaffLicensesData } = staffMemberIds.length > 0
    ? await q.getStaffLicensesByStaffMemberIds(supabase, staffMemberIds)
    : { data: [] }

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
    })) || []
  const licensesByStaff = allStaffLicenses.reduce(
    (acc: Record<string, typeof allStaffLicenses>, license) => {
      const sid = license.caregiver_member_id
      if (!acc[sid]) acc[sid] = []
      acc[sid].push(license)
      return acc
    },
    {}
  )


  // Calculate statistics
  const totalStaff = staffMembers?.length || 0
  const activeStaff = staffMembers?.filter(s => s.status === 'active').length || 0
  
  const today = new Date()
  const expiringLicenses = allStaffLicenses?.filter(sl => {
    if (sl.days_until_expiry) {
      return sl.days_until_expiry <= 30 && sl.days_until_expiry > 0
    }
    return false
  }).length || 0

  // Get staff with expiring licenses count
  const staffWithExpiringLicenses =
    staffMembers?.map((staff) => {
      const licenses = licensesByStaff[staff.id] || []
      const expiringCount = licenses.filter((l) => {
        if (l.days_until_expiry) {
          return l.days_until_expiry <= 30 && l.days_until_expiry > 0
        }
        return false
      }).length
      const pr = currentPayRateByCaregiverId.get(staff.id)
      const currentPayRate = pr !== undefined ? pr : null
      return { ...staff, expiringLicensesCount: expiringCount, currentPayRate }
    }) || []

  return (
    <DashboardLayout user={session.user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <StaffManagementClient
        staffMembers={staffMembers || []}
        licensesByStaff={licensesByStaff}
        totalStaff={totalStaff}
        activeStaff={activeStaff}
        expiringLicenses={expiringLicenses}
        staffWithExpiringLicenses={staffWithExpiringLicenses}
        staffRoleNames={staffRoleNames}
        canManageNotes={canManageNotes}
        agencyId={agencyId ?? undefined}
      />
    </DashboardLayout>
  )
}


