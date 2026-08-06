import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { assertAgencyReportsPageAccess } from '@/lib/agency-reports-access'
import Link from 'next/link'
import { getStaffCertificationsReport } from '@/app/actions/reports'
import { ArrowLeft } from 'lucide-react'
import StaffCertificationsReportClient from '@/components/reports/StaffCertificationsReportClient'

export default async function StaffCertificationsReportPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  assertAgencyReportsPageAccess(session!.profile)

  // Get report data
  const result = await getStaffCertificationsReport()
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

      <StaffCertificationsReportClient reportData={reportData} />
    </div>
  )
}
