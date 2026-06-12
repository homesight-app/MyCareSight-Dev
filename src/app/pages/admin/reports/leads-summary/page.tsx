import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import AdminLeadsSummaryReport, {
  type LeadsSummaryData,
  type ServiceTypeRow,
  type MonthlyLeadsPoint,
} from '@/components/AdminLeadsSummaryReport'
import { AGENCY_SERVICE_TYPES } from '@/lib/constants/lead-configs'

function last12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function getMonthLabel(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default async function LeadsSummaryReportPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: rawLeads }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getLeads(supabase, { leadType: 'agency', includeArchived: true }),
  ])

  const leads = rawLeads ?? []

  const won = leads.filter(l => l.stage === 'signed').length
  const lost = leads.filter(l => l.stage === 'lost').length
  const winRate = won + lost > 0 ? Math.round(won / (won + lost) * 100) : 0

  const activeLeads = leads.filter(l => l.status === 'active').length
  const archivedLeads = leads.filter(l => l.status === 'archived').length

  const serviceTypeBreakdown: ServiceTypeRow[] = AGENCY_SERVICE_TYPES.map(st => {
    const stLeads = leads.filter(l => l.service_type === st.key)
    const count = stLeads.length
    const value = stLeads.reduce((sum, l) => sum + (l.price ?? 0), 0)
    return {
      key: st.key,
      label: st.label,
      count,
      value,
      pct: leads.length > 0 ? Math.round(count / leads.length * 100) : 0,
    }
  }).filter(r => r.count > 0).sort((a, b) => b.count - a.count)

  const monthKeys = last12Months()
  const monthlyMap: Record<string, number> = {}
  for (const m of monthKeys) monthlyMap[m] = 0

  for (const lead of leads) {
    const ym = lead.created_at.slice(0, 7)
    if (monthlyMap[ym] !== undefined) monthlyMap[ym]++
  }

  const monthlyNewLeads: MonthlyLeadsPoint[] = monthKeys.map(m => ({
    month: m,
    label: getMonthLabel(m),
    count: monthlyMap[m],
  }))

  const data: LeadsSummaryData = {
    totalLeads: leads.length,
    won,
    lost,
    winRate,
    activeLeads,
    archivedLeads,
    serviceTypeBreakdown,
    monthlyNewLeads,
  }

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <AdminLeadsSummaryReport data={data} />
    </AdminLayout>
  )
}
