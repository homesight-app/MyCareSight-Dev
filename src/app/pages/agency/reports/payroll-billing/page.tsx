import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { assertAgencyReportsPageAccess } from '@/lib/agency-reports-access'
import PayrollBillingReportContent from '@/components/PayrollBillingReportContent'
import { getPayrollBillingReportRowsAction } from '@/app/actions/payroll-billing-report'

function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default async function PayrollBillingReportPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  assertAgencyReportsPageAccess(session!.profile)

  const { from, to } = defaultDateRange()
  const { rows, error } = await getPayrollBillingReportRowsAction(from, to)

  return (
    <PayrollBillingReportContent
      initialRows={rows}
      initialDateFrom={from}
      initialDateTo={to}
      loadError={error}
    />
  )
}
