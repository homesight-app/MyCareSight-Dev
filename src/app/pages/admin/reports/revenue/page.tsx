import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import AdminRevenueReport, { type RevenueReportData, type SignedDeal, type MonthlyPoint } from '@/components/AdminRevenueReport'
import { AGENCY_SERVICE_TYPES } from '@/lib/constants/lead-configs'

function getMonthLabel(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function last12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export default async function RevenueReportPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: rawLeads }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getLeads(supabase, { leadType: 'agency', includeArchived: true }),
  ])

  const leads = rawLeads ?? []
  const serviceTypeLabel = (key: string | null) =>
    AGENCY_SERVICE_TYPES.find(s => s.key === key)?.label ?? key ?? '—'

  const signedLeads = leads.filter(l => l.stage === 'signed')

  const totalContractValue = signedLeads.reduce((sum, l) => sum + (l.price ?? 0), 0)

  const retainerCollected = signedLeads.reduce((sum, l) =>
    sum + (l.retainer_paid_date ? (l.retainer_amount ?? 0) : 0), 0)

  const installmentRevenue = signedLeads.reduce((sum, l) => {
    if ((l.installments ?? 0) > 0 && l.installment_amount != null) {
      return sum + (l.installment_amount * (l.installments ?? 0))
    }
    return sum
  }, 0)

  const projectedRemaining = totalContractValue - retainerCollected - installmentRevenue

  const signedDealsList: SignedDeal[] = signedLeads.map(l => ({
    id: l.id,
    name: `${l.contact_first_name ?? ''} ${l.contact_last_name ?? ''}`.trim() || '(No name)',
    company: l.company_name,
    serviceType: serviceTypeLabel(l.service_type),
    price: l.price,
    retainerAmount: l.retainer_amount,
    signedDate: l.signed_date,
  })).sort((a, b) => {
    if (!a.signedDate && !b.signedDate) return 0
    if (!a.signedDate) return 1
    if (!b.signedDate) return -1
    return b.signedDate.localeCompare(a.signedDate)
  })

  // Monthly signed deals — last 12 months keyed by signed_date
  const monthKeys = last12Months()
  const monthlyMap: Record<string, { count: number; value: number }> = {}
  for (const m of monthKeys) monthlyMap[m] = { count: 0, value: 0 }

  for (const lead of signedLeads) {
    if (!lead.signed_date) continue
    const ym = lead.signed_date.slice(0, 7)
    if (monthlyMap[ym]) {
      monthlyMap[ym].count++
      monthlyMap[ym].value += lead.price ?? 0
    }
  }

  const monthlyData: MonthlyPoint[] = monthKeys.map(m => ({
    month: m,
    label: getMonthLabel(m),
    count: monthlyMap[m].count,
    value: monthlyMap[m].value,
  }))

  const data: RevenueReportData = {
    totalContractValue,
    retainerCollected,
    installmentRevenue,
    projectedRemaining: Math.max(projectedRemaining, 0),
    signedDeals: signedDealsList,
    monthlyData,
  }

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <AdminRevenueReport data={data} />
    </AdminLayout>
  )
}
