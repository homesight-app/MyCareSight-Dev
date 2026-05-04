import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import ApplicationsContent from '@/components/ApplicationsContent'

export default async function ApplicationsPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const supabase = await createClient()

  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)

  const { data: agencyRecord } = await q.getClientByCompanyOwnerIdWithAgency(supabase, session.user.id)
  const agencyId = agencyRecord?.agency_id ?? null

  const [ownResult, agencyResult] = await Promise.all([
    q.getApplicationsByCompanyOwnerId(supabase, session.user.id),
    agencyId ? q.getApplicationsByAgencyId(supabase, agencyId) : Promise.resolve({ data: [] }),
  ])
  const seenIds = new Set<string>()
  const applications = [...(ownResult.data ?? []), ...(agencyResult.data ?? [])].filter((a) => {
    if (seenIds.has(a.id)) return false
    seenIds.add(a.id)
    return true
  })

  const appIds = applications.map((a: { id: string }) => a.id)
  const { data: docRows } = appIds.length > 0
    ? await q.getApplicationDocumentsApplicationIds(supabase, appIds)
    : { data: [] }
  const documentCounts = (docRows || []).reduce((acc: Record<string, number>, doc: { application_id: string }) => {
    acc[doc.application_id] = (acc[doc.application_id] || 0) + 1
    return acc
  }, {})

  return (
    <DashboardLayout user={session.user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <ApplicationsContent 
        applications={applications || []} 
        documentCounts={documentCounts}
      />
    </DashboardLayout>
  )
}

