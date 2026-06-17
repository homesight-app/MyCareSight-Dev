import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { getTemplates } from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import TemplatesContent from '@/components/TemplatesContent'

export default async function AgencyTemplatesPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()
  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)

  if (profile?.role === 'admin') redirect('/pages/admin/templates')
  if (profile?.role === 'expert') redirect('/pages/expert/clients')
  if (profile?.role === 'care_coordinator') redirect('/pages/agency')

  const [{ data: up }, { count: unreadNotifications }] = await Promise.all([
    q.getAgencyIdFromProfile(supabase, session.user.id),
    q.getUnreadNotificationsCount(supabase, session.user.id),
  ])

  const agencyId = up?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const { data: templates } = await getTemplates(supabase, { agencyId, includeInactive: true })

  return (
    <DashboardLayout user={session.user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <div className="p-4 sm:p-6">
        <TemplatesContent
          templates={templates ?? []}
          isAdmin={false}
          agencyId={agencyId}
          basePath="/pages/agency/templates"
        />
      </div>
    </DashboardLayout>
  )
}
