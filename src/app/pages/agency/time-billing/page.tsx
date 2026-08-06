import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import TimeBillingContent from '@/components/TimeBillingContent'
import { fetchTimeBillingRows } from '@/lib/time-billing-dashboard'

export default async function TimeBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()

  const params = await searchParams
  const now = new Date()
  const selectedMonth = params.month ? parseInt(params.month) : now.getMonth() + 1
  const selectedYear  = params.year  ? parseInt(params.year)  : now.getFullYear()

  // Clamp to the full selected month
  const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
  const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
  const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const dashboard = await fetchTimeBillingRows(supabase, { startDate, endDate })

  return (
    <TimeBillingContent
      rows={dashboard.rows}
      loadError={dashboard.error}
      selectedMonth={selectedMonth}
      selectedYear={selectedYear}
    />
  )
}
