import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import LeadsContent from '@/components/LeadsContent'
import { AGENCY_LEAD_CONTEXT, type LeadContext } from '@/lib/constants/lead-configs'

export default async function AgencyLeadsPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()
  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)

  if (profile?.role === 'admin') redirect('/pages/admin')
  if (profile?.role === 'expert') redirect('/pages/expert/clients')
  if (profile?.role !== 'company_owner') redirect('/pages/agency')

  const [{ data: up }, { count: unreadNotifications }] = await Promise.all([
    q.getAgencyIdFromProfile(supabase, session.user.id),
    q.getUnreadNotificationsCount(supabase, session.user.id),
  ])
  const agencyId = up?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const context: LeadContext = { ...AGENCY_LEAD_CONTEXT, agencyId }

  const { data: leads } = await q.getLeads(supabase, { leadType: 'patient', agencyId, includeArchived: true })

  return (
    <DashboardLayout
      user={session.user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
    >
      <LeadsContent
        leads={leads ?? []}
        context={context}
      />
    </DashboardLayout>
  )
}
