import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import CasesByStatusChart from '@/components/CasesByStatusChart'
import CasesByStateChart from '@/components/CasesByStateChart'
import {
  Users,
  Clock,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react'

export default async function AdminDashboardPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: applicationsData } = await q.getApplicationsByStatuses(supabase, [
    'requested',
    'in_progress',
    'under_review',
    'needs_revision',
    'approved',
    'rejected',
    'closed',
  ])

  const applications = applicationsData || []

  // Calculate statistics
  const totalCases = applications.length
  const inProgress = applications.filter(c => c.status === 'in_progress').length
  const inReview = applications.filter(c => c.status === 'under_review').length
  const completed = applications.filter(c => c.status === 'approved').length
  const avgProgress = applications.length > 0
    ? Math.round(applications.reduce((acc, c) => acc + (c.progress_percentage || 0), 0) / applications.length)
    : 0

  // Cases by status for pie chart
  const statusCounts = {
    in_progress: applications.filter(c => c.status === 'in_progress').length,
    under_review: applications.filter(c => c.status === 'under_review').length,
    approved: applications.filter(c => c.status === 'approved').length,
    rejected: applications.filter(c => c.status === 'rejected').length,
  }

  // Cases by state for bar chart
  const stateCounts: Record<string, number> = {}
  applications.forEach(caseItem => {
    stateCounts[caseItem.state] = (stateCounts[caseItem.state] || 0) + 1
  })

  return (
      <div className="space-y-4 md:space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-6">
          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
              </div>
            </div>
            <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{totalCases}</div>
            <div className="text-xs md:text-sm text-gray-600">All time</div>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
              </div>
            </div>
            <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{inProgress}</div>
            <div className="text-xs md:text-sm text-gray-600">Active cases</div>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-yellow-600" />
              </div>
            </div>
            <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{inReview}</div>
            <div className="text-xs md:text-sm text-gray-600">Pending approval</div>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
              </div>
            </div>
            <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{completed}</div>
            <div className="text-xs md:text-sm text-gray-600">Successfully licensed</div>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
              </div>
            </div>
            <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{avgProgress}%</div>
            <div className="text-xs md:text-sm text-gray-600">Across all cases</div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Cases by Status Pie Chart */}
          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Cases by Status</h2>
            <CasesByStatusChart totalCases={totalCases} statusCounts={statusCounts} />
          </div>

          {/* Cases by State Bar Chart */}
          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Cases by State</h2>
            <CasesByStateChart stateCounts={stateCounts} />
          </div>
        </div>

      </div>
  )
}

