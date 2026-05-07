import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ApplicationDetailWrapper from '@/components/ApplicationDetailWrapper'

export default async function ApplicationDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)
  const { data: application } = await q.getApplicationById(supabase, id)

  if (!application) {
    if (profile?.role === 'expert') redirect('/pages/expert/clients')
    else redirect('/pages/agency/licenses')
  }

  const { data: documents } = await q.getApplicationDocumentsByApplicationId(supabase, id)

  return (
    <ApplicationDetailWrapper
      application={application}
      documents={documents || []}
      user={session.user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
    />
  )
}

