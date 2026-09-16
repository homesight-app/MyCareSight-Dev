import { requireAdmin } from '@/lib/auth-helpers'
import * as q from '@/lib/supabase/query'
import AdminLeadsSummaryReport from '@/components/AdminLeadsSummaryReport'

export default async function LeadsSummaryReportPage() {
  await requireAdmin()

  const { data: leads } = await q.getLeads({ leadType: 'agency', includeArchived: true })

  return (
      <AdminLeadsSummaryReport leads={leads ?? []} />
  )
}
