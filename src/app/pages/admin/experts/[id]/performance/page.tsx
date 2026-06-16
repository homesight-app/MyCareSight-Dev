import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import Link from 'next/link'
import { 
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  TrendingUp
} from 'lucide-react'

export default async function ExpertPerformancePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { user, profile } = await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: expert }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getLicensingExpertById(supabase, id)
  ])

  const [{ data: applications }, { data: clients }] = await Promise.all([
    expert?.user_id
      ? q.getApplicationsByAssignedExpertId(supabase, expert.user_id)
      : Promise.resolve({ data: [] }),
    expert?.user_id
      ? q.getClientsByExpertId(supabase, expert.user_id)
      : Promise.resolve({ data: [] })
  ])
  if (!expert) {
    redirect('/pages/admin/users?tab=experts')
  }

  // Calculate statistics
  const totalApplications = applications?.length || 0
  const approvedApplications = applications?.filter(a => a.status === 'approved').length || 0
  const inProgressApplications = applications?.filter(a => a.status === 'in_progress').length || 0
  const underReviewApplications = applications?.filter(a => a.status === 'under_review').length || 0
  const rejectedApplications = applications?.filter(a => a.status === 'rejected').length || 0
  const avgProgress = applications && applications.length > 0
    ? Math.round(applications.reduce((acc, a) => acc + (a.progress_percentage || 0), 0) / applications.length)
    : 0
  const approvalRate = totalApplications > 0 
    ? Math.round((approvedApplications / totalApplications) * 100) 
    : 0

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <AdminLayout 
      user={user} 
      profile={profile} 
      unreadNotifications={unreadNotifications || 0}
    >
      <div className="space-y-6">
        <Link
          href={`/pages/admin/users?tab=experts`}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Expert Profile
        </Link>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Performance Metrics for {expert.first_name} {expert.last_name}
            </h1>
            <p className="text-sm text-gray-600">View detailed performance statistics and metrics</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{totalApplications}</div>
                  <div className="text-sm text-gray-600">Total Applications</div>
                </div>
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{approvedApplications}</div>
                  <div className="text-sm text-gray-600">Approved</div>
                </div>
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{approvalRate}%</div>
                  <div className="text-sm text-gray-600">Approval Rate</div>
                </div>
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-orange-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{avgProgress}%</div>
                  <div className="text-sm text-gray-600">Avg Progress</div>
                </div>
              </div>
            </div>
          </div>

          {/* Application Status Breakdown */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Application Status Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  <div>
                    <div className="text-xl font-bold text-gray-900">{inProgressApplications}</div>
                    <div className="text-sm text-gray-600">In Progress</div>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-xl font-bold text-gray-900">{underReviewApplications}</div>
                    <div className="text-sm text-gray-600">Under Review</div>
                  </div>
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <div>
                    <div className="text-xl font-bold text-gray-900">{rejectedApplications}</div>
                    <div className="text-sm text-gray-600">Rejected</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Applications */}
          {applications && applications.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Applications</h2>
              <div className="space-y-3">
                {applications.slice(0, 10).map((app) => (
                  <div
                    key={app.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900">{app.application_name}</h3>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            app.status === 'approved' 
                              ? 'bg-green-100 text-green-800'
                              : app.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : app.status === 'under_review'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {app.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="mr-4">State: {app.state}</span>
                          <span>Progress: {app.progress_percentage || 0}%</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Created: {formatDate(app.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
