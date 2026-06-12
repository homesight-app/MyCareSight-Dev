import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import AdminPipelineReport, { type PipelineReportData, type StageRow } from '@/components/AdminPipelineReport'
import { LEAD_STAGES } from '@/lib/constants/lead-configs'

export default async function PipelineReportPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: rawLeads }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getLeads(supabase, { leadType: 'agency', includeArchived: true }),
  ])

  const leads = rawLeads ?? []
  const totalLeads = leads.length

  const stages: StageRow[] = LEAD_STAGES.map(s => {
    const stageLeads = leads.filter(l => l.stage === s.key)
    const count = stageLeads.length
    const value = stageLeads.reduce((sum, l) => sum + (l.price ?? 0), 0)
    return {
      key: s.key,
      label: s.label,
      count,
      value,
      avgDealSize: count > 0 ? Math.round(value / count) : 0,
      pct: totalLeads > 0 ? Math.round(count / totalLeads * 100) : 0,
    }
  })

  const totalPipelineValue = leads.reduce((sum, l) => sum + (l.price ?? 0), 0)
  const signedLeads = leads.filter(l => l.stage === 'signed')
  const lostLeads = leads.filter(l => l.stage === 'lost')
  const totalSignedValue = signedLeads.reduce((sum, l) => sum + (l.price ?? 0), 0)
  const winRate = signedLeads.length + lostLeads.length > 0
    ? Math.round(signedLeads.length / (signedLeads.length + lostLeads.length) * 100)
    : 0

  const data: PipelineReportData = { stages, totalLeads, totalPipelineValue, totalSignedValue, winRate }

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <AdminPipelineReport data={data} />
    </AdminLayout>
  )
}
