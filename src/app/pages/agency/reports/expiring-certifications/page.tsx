import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { assertAgencyReportsPageAccess } from '@/lib/agency-reports-access'
import Link from 'next/link'
import { getExpiringCertificationsReport } from '@/app/actions/reports'
import { ArrowLeft } from 'lucide-react'
import ExpiringCertificationsReportClient from '@/components/reports/ExpiringCertificationsReportClient'

export default async function ExpiringCertificationsReportPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  assertAgencyReportsPageAccess(session!.profile)

  // Get report data
  const result = await getExpiringCertificationsReport()
  const reportData = result.data || []

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/pages/agency/reports"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Reports
      </Link>

      <ExpiringCertificationsReportClient reportData={reportData} />
    </div>
  )
}
