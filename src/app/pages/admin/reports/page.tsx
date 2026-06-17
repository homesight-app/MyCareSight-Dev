import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import Link from 'next/link'
import { TrendingUp, DollarSign, Users } from 'lucide-react'

const REPORTS = [
  {
    href: '/pages/admin/reports/pipeline',
    title: 'Pipeline Overview',
    description: 'See where leads sit across each stage. Counts, pipeline value, and win rate.',
    icon: TrendingUp,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
  },
  {
    href: '/pages/admin/reports/revenue',
    title: 'Revenue Tracker',
    description: 'Signed contract value, retainer collected, installment revenue, and monthly trends.',
    icon: DollarSign,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  {
    href: '/pages/admin/reports/leads-summary',
    title: 'Leads Summary',
    description: 'Lead volume, service type breakdown, win/loss analysis, and monthly new leads.',
    icon: Users,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
]

export default async function AdminReportsPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()
  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, user.id)

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {REPORTS.map(report => {
            const Icon = report.icon
            return (
              <Link
                key={report.href}
                href={report.href}
                className="group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 transition-all"
              >
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${report.iconBg} mb-4`}>
                  <Icon className={`w-5 h-5 ${report.iconColor}`} />
                </div>
                <h2 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                  {report.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{report.description}</p>
              </Link>
            )
          })}
        </div>
      </div>
    </AdminLayout>
  )
}
