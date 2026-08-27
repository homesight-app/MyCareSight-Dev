import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
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

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const { id } = await params

  const [{ data: lead }, { data: notes }, { data: tasks }, { data: documents }, agencyStagesResult, patientDetailsResult] = await Promise.all([
    q.getLeadById(supabase, id),
    q.getLeadNotes(supabase, id),
    q.getLeadTasks(supabase, id),
    q.getLeadDocuments(supabase, id),
    q.getAgencyLeadStages(supabase, agencyId),
    q.getPatientLeadDetails(supabase, id),
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
  const agencyStages = (agencyStagesResult.data ?? []) as import('@/lib/constants/lead-configs').AgencyLeadStage[]
  const patientDetails = patientDetailsResult.data ?? null

  return (
    <LeadDetailContent
      lead={lead as unknown as LeadDetailProps['lead']}
      notes={(notes ?? []) as unknown as LeadDetailProps['notes']}
      tasks={tasks ?? []}
      documents={(documents ?? []) as unknown as LeadDetailProps['documents']}
      context={context}
      currentUserRole={session!.profile?.role}
      stages={agencyStages}
      patientDetails={patientDetails as unknown as LeadDetailProps['patientDetails']}
    />
  )
}
