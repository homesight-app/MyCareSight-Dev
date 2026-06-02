import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import VisitManagementContent from '@/components/VisitManagementContent'
import { fetchVisitAssignmentDashboardData } from '@/lib/visit-assignment-dashboard'
import { fetchAllVisitsDashboardData } from '@/lib/visit-all-visits-dashboard'

export default async function CareVisitsPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const supabase = await createClient()
  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  if (profile?.role === 'admin') redirect('/pages/admin')
  if (profile?.role === 'expert') redirect('/pages/expert/clients')

  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)

  const { data: up } = await q.getAgencyIdFromProfile(supabase, session.user.id)
  const agencyId = up?.agency_id ?? ''
  const role = session.profile?.role ?? profile?.role ?? ''
  const canManageNotes =
    role === 'agency_admin' || role === 'company_owner' || role === 'care_coordinator'

  const dashboard = await fetchVisitAssignmentDashboardData(supabase)
  const allVisits = await fetchAllVisitsDashboardData(supabase)
  const pendingRequestCount =
    dashboard.visits.reduce((sum, v) => sum + v.requests.length, 0) + dashboard.unassignmentItems.length

  return (
    <DashboardLayout
      user={session.user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
      careVisitsPendingCount={pendingRequestCount}
    >
      <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading care visits…</div>}>
        <VisitManagementContent
          visits={dashboard.visits}
          unassignmentItems={dashboard.unassignmentItems}
          allVisits={allVisits.allVisits}
          allClients={allVisits.allClients}
          allCaregivers={allVisits.allCaregivers}
          resolved={dashboard.resolved}
          assignmentApprovedTotal={dashboard.assignmentApprovedTotal}
          assignmentDeclinedTotal={dashboard.assignmentDeclinedTotal}
          unassignmentApprovedTotal={dashboard.unassignmentApprovedTotal}
          unassignmentDeclinedTotal={dashboard.unassignmentDeclinedTotal}
          loadError={dashboard.error}
          agencyId={agencyId}
          canManageNotes={canManageNotes}
        />
      </Suspense>
    </DashboardLayout>
  )
}
