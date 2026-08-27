import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { assertAgencyReportsPageAccess } from '@/lib/agency-reports-access'
import AgencyReportCardLink, { type AgencyReportCardIconKey } from '@/components/reports/AgencyReportCardLink'

type ReportDef = {
  id: string
  title: string
  description: string
  href: string
  icon: AgencyReportCardIconKey
  iconColor: string
  iconTextColor: string
}

export default async function ReportsPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  assertAgencyReportsPageAccess(session!.profile)

  const reports: ReportDef[] = [
    {
      id: 'payroll-billing',
      title: 'Payroll & Billing Report',
      description:
        'Hours breakdown per caregiver and client with pay/bill amounts. Includes payroll summary, client billing summary, and CSV export.',
      href: '/pages/agency/reports/payroll-billing',
      icon: 'dollar-sign',
      iconColor: 'bg-emerald-50',
      iconTextColor: 'text-emerald-700',
    },
    {
      id: 'staff-certifications',
      title: 'Staff Certifications Report',
      description: 'Comprehensive list of all staff members and their professional certifications',
      href: '/pages/agency/reports/staff-certifications',
      icon: 'award',
      iconColor: 'bg-blue-100',
      iconTextColor: 'text-blue-600',
    },
    {
      id: 'expiring-certifications',
      title: 'Expiring Certifications Report',
      description: 'Staff certifications expiring within the next 90 days',
      href: '/pages/agency/reports/expiring-certifications',
      icon: 'alert-triangle',
      iconColor: 'bg-yellow-100',
      iconTextColor: 'text-yellow-600',
    },
    {
      id: 'staff-roster',
      title: 'Staff Roster Report',
      description: 'Complete staff directory with contact information',
      href: '/pages/agency/reports/staff-roster',
      icon: 'users',
      iconColor: 'bg-blue-100',
      iconTextColor: 'text-blue-600',
    },
    {
      id: 'lead-pipeline',
      title: 'Lead Pipeline Report',
      description: 'Patient lead counts by pipeline stage with conversion percentages',
      href: '/pages/agency/reports/lead-pipeline',
      icon: 'git-branch',
      iconColor: 'bg-indigo-50',
      iconTextColor: 'text-indigo-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Reports</h1>
        <p className="text-gray-600 text-base md:text-lg">
          Generate and download reports based on your organization&apos;s data
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {reports.map((report) => (
          <AgencyReportCardLink
            key={report.id}
            href={report.href}
            title={report.title}
            description={report.description}
            icon={report.icon}
            iconColor={report.iconColor}
            iconTextColor={report.iconTextColor}
          />
        ))}
      </div>
    </div>
  )
}
