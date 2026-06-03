import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ExpertDashboardLayout from '@/components/ExpertDashboardLayout'
import ExpertApplicationsContent from '@/components/ExpertApplicationsContent'

export default async function ExpertApplicationsPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  if (session.profile?.role !== 'expert') redirect('/pages/agency')

  const supabase = await createClient()
  const { data: assignedApplicationsData } = await q.getApplicationsByAssignedExpertId(supabase, session.user.id)
  const filtered = (assignedApplicationsData ?? []).filter(app =>
    ['requested', 'in_progress', 'under_review', 'needs_revision', 'approved', 'rejected', 'closed'].includes(app.status ?? '')
  )

  const ownerIds = Array.from(new Set(filtered.map(app => app.company_owner_id).filter(Boolean) as string[]))
  const { data: ownerProfilesData } = ownerIds.length > 0
    ? await q.getUserProfilesByIds(supabase, ownerIds, 'id, full_name, email')
    : { data: [] }
  type OwnerProfileRow = { id: string; full_name: string | null; email: string | null }
  const ownerProfilesMap = new Map(((ownerProfilesData ?? []) as unknown as OwnerProfileRow[]).map(p => [p.id, p]))

  const assignedApplications = filtered.map(app => ({
    ...app,
    user_profiles: ownerProfilesMap.get(app.company_owner_id) ?? null
  }))

  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)

  return (
    <ExpertDashboardLayout 
      user={{ id: session.user.id, email: session.user.email }} 
      profile={session.profile}
      unreadNotifications={unreadNotifications || 0}
    >
      <ExpertApplicationsContent applications={assignedApplications} />
    </ExpertDashboardLayout>
  )
}
