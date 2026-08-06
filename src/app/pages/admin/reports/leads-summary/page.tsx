import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLeadsSummaryReport from '@/components/AdminLeadsSummaryReport'

export default async function LeadsSummaryReportPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: leads } = await q.getLeads(supabase, { leadType: 'agency', includeArchived: true })

  return (
      <AdminLeadsSummaryReport leads={leads ?? []} />
  )
}
