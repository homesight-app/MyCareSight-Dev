import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import LeadDetailContent from '@/components/LeadDetailContent'
import { AGENCY_LEAD_CONTEXT, type LeadContext } from '@/lib/constants/lead-configs'
import type { ComponentProps } from 'react'

type LeadDetailProps = ComponentProps<typeof LeadDetailContent>

export default async function AgencyLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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

  const { id } = await params

  const [{ data: lead }, { data: notes }, { data: tasks }, { data: documents }] = await Promise.all([
    q.getLeadById(supabase, id),
    q.getLeadNotes(supabase, id),
    q.getLeadTasks(supabase, id),
    q.getLeadDocuments(supabase, id),
  ])

  if (!lead || lead.agency_id !== agencyId) redirect('/pages/agency/leads')

  // HIPAA audit log: patient leads can contain PHI
  await supabase.from('audit_log').insert({
    action: 'VIEW_LEAD',
    table_name: 'leads',
    record_id: lead.id,
    performed_by_user_id: session.user.id,
    agency_id: agencyId,
    details: { lead_type: 'patient' },
  })

  const context: LeadContext = { ...AGENCY_LEAD_CONTEXT, agencyId }

  return (
    <DashboardLayout
      user={session.user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
    >
      <LeadDetailContent
        lead={lead as unknown as LeadDetailProps['lead']}
        notes={(notes ?? []) as unknown as LeadDetailProps['notes']}
        tasks={tasks ?? []}
        documents={(documents ?? []) as unknown as LeadDetailProps['documents']}
        context={context}
        currentUserRole={profile?.role}
      />
    </DashboardLayout>
  )
}
