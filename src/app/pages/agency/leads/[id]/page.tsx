import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { authorizeAndAuditAgencyLeadRead } from '@/lib/repositories/agency-lead-reads'
import * as q from '@/lib/supabase/query'
import LeadDetailContent from '@/components/LeadDetailContent'
import { AGENCY_LEAD_CONTEXT, type LeadContext } from '@/lib/constants/lead-configs'
import type { ComponentProps } from 'react'
import { withUserContext } from '@/db'
import { getLeadCollaboratorOptionsAction } from '@/app/actions/leads'

type LeadDetailProps = ComponentProps<typeof LeadDetailContent>

export default async function AgencyLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const { id } = await params
  const leadAccess = await authorizeAndAuditAgencyLeadRead(agencyId, id)
  if (!leadAccess.allowed) redirect('/pages/agency/leads')

  const role = session!.profile?.role ?? ''
  const [{ data: lead }, { data: notes }, { data: tasks }, { data: documents }, agencyStagesResult, patientDetailsResult] =
    await withUserContext(session!.user.id, role, agencyId, () => Promise.all([
      q.getLeadById(id),
      q.getLeadNotes(id),
      q.getLeadTasks(id),
      q.getLeadDocuments(id),
      q.getAgencyLeadStages(agencyId),
      q.getPatientLeadDetails(id),
    ]))

  if (!lead || lead.agency_id !== agencyId) redirect('/pages/agency/leads')

  const context: LeadContext = { ...AGENCY_LEAD_CONTEXT, agencyId }
  const agencyStages = (agencyStagesResult.data ?? []) as import('@/lib/constants/lead-configs').AgencyLeadStage[]
  const patientDetails = patientDetailsResult.data ?? null
  const { data: collaborators } = await getLeadCollaboratorOptionsAction()

  return (
    <LeadDetailContent
      lead={lead as unknown as LeadDetailProps['lead']}
      notes={(notes ?? []) as unknown as LeadDetailProps['notes']}
      tasks={tasks ?? []}
      documents={(documents ?? []) as unknown as LeadDetailProps['documents']}
      context={context}
      currentUserRole={session!.profile?.role}
      platformStaff={collaborators ?? []}
      stages={agencyStages}
      patientDetails={patientDetails as unknown as LeadDetailProps['patientDetails']}
    />
  )
}
