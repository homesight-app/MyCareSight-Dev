import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import TimeBillingContent from '@/components/TimeBillingContent'
import FeatureGate from '@/components/FeatureGate'
import { fetchTimeBillingRows } from '@/lib/time-billing-dashboard'
import { requireAgencyCapability } from '@/lib/feature-access'
import FeatureLockedPage from '@/components/FeatureLockedPage'

export default async function TimeBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  try {
    await requireAgencyCapability('care_operations')
  } catch {
    return <FeatureLockedPage capabilityKey="care_operations" />
  }

  const params = await searchParams
  const now = new Date()
  const selectedMonth = params.month ? parseInt(params.month) : now.getMonth() + 1
  const selectedYear  = params.year  ? parseInt(params.year)  : now.getFullYear()

  const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
  const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
  const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const dashboard = await fetchTimeBillingRows({ startDate, endDate })
  const agencyId=dashboard.agencyId ?? null

  return (
    <FeatureGate capability="care_operations" agencyId={agencyId}>
      <TimeBillingContent
        rows={dashboard.rows}
        loadError={dashboard.error}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
      />
    </FeatureGate>
  )
}
