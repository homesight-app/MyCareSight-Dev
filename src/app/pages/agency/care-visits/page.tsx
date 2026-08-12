import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import VisitManagementContent from '@/components/VisitManagementContent'
import FeatureGate from '@/components/FeatureGate'
import { fetchVisitAssignmentDashboardData } from '@/lib/visit-assignment-dashboard'
import { fetchAllVisitsDashboardData } from '@/lib/visit-all-visits-dashboard'

export default async function CareVisitsPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const supabase = await createClient()
  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? ''
  const role = session.profile?.role ?? ''
  const canManageNotes =
    role === 'agency_admin' || role === 'company_owner' || role === 'care_coordinator'

  const dashboard = await fetchVisitAssignmentDashboardData(supabase)
  const allVisits = await fetchAllVisitsDashboardData(supabase)
  const pendingRequestCount =
    dashboard.visits.reduce((sum, v) => sum + v.requests.length, 0) + dashboard.unassignmentItems.length

  return (
    <FeatureGate feature="care_visits" agencyId={agencyId || null}>
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
    </FeatureGate>
  )
}
