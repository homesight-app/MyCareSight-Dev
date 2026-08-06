import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import LeadsContent from '@/components/LeadsContent'
import { AGENCY_LEAD_CONTEXT, type LeadContext } from '@/lib/constants/lead-configs'

export default async function AgencyLeadsPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const context: LeadContext = { ...AGENCY_LEAD_CONTEXT, agencyId }

  const { data: leads } = await q.getLeads(supabase, { leadType: 'patient', agencyId, includeArchived: true })

  return (
    <LeadsContent
      leads={leads ?? []}
      context={context}
    />
  )
}
