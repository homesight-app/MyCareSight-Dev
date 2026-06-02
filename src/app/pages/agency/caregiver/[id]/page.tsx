import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import CaregiverProfileContent from '@/components/CaregiverProfileContent'

export default async function CaregiverProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ clientId?: string; embed?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const { id: staffId } = await params
  const { clientId, embed } = await searchParams
  const isEmbed = embed === '1' || embed === 'true'

  const supabase = await createClient()
  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  const { data: up } = await q.getAgencyIdFromProfile(supabase, session.user.id)
  const agencyId = up?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency/caregiver')

  const { data: staff, error: staffError } = await q.getStaffMemberByIdAndAgencyId(supabase, staffId, agencyId)

  if (staffError || !staff) redirect('/pages/agency/caregiver')

  const todayYmd = new Date().toISOString().slice(0, 10)
  const { data: openPayRows } = await supabase
    .from('caregiver_pay_rates')
    .select('pay_rate, service_type, effective_start')
    .eq('caregiver_member_id', staffId)
    .lte('effective_start', todayYmd)
    .or(`effective_end.is.null,effective_end.gt.${todayYmd}`)

  let currentPayRate: number | null = null
  const rows = [...(openPayRows ?? [])].sort((a, b) => {
    const sa = String((a as { effective_start?: string | null }).effective_start ?? '')
    const sb = String((b as { effective_start?: string | null }).effective_start ?? '')
    return sb.localeCompare(sa)
  })
  const defaultBand = rows.find((r) => r.service_type == null)
  const chosen = defaultBand ?? rows[0]
  if (chosen) {
    const n = Number(chosen.pay_rate)
    if (Number.isFinite(n)) currentPayRate = n
  }

  const { data: staffLicensesData } = await q.getStaffLicensesByStaffMemberIds(supabase, [staffId])
  const allStaffLicenses = (staffLicensesData ?? []).map((license: any) => ({
    id: license.id,
    caregiver_member_id: license.caregiver_member_id,
    license_type: license.license_type,
    license_number: license.license_number || 'N/A',
    state: license.state,
    status: license.status,
    expiry_date: license.expiry_date,
    days_until_expiry: license.days_until_expiry,
  }))

  const role = session.profile?.role ?? ''
  const canManageNotes =
    role === 'agency_admin' || role === 'company_owner' || role === 'care_coordinator'

  const profileCard = (
    <div className="max-w-4xl mx-auto mt-20">
      <div
        className={`bg-white rounded-xl shadow-md border border-gray-100 p-6 ${isEmbed ? '' : 'mt-6'}`}
      >
        <CaregiverProfileContent
          staff={staff as any}
          licenses={allStaffLicenses as any}
          currentPayRate={currentPayRate}
          backHref={
            isEmbed
              ? undefined
              : clientId
                ? `/pages/agency/clients/${clientId}`
                : '/pages/agency/clients'
          }
          canManageNotes={canManageNotes}
          agencyId={agencyId}
        />
      </div>
    </div>
  )

  if (isEmbed) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6 print:bg-white print:p-0">
        <div className="print:shadow-none print:rounded-none">{profileCard}</div>
      </div>
    )
  }

  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)

  return (
    <DashboardLayout user={session.user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      {profileCard}
    </DashboardLayout>
  )
}

