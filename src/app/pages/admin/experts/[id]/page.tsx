import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import Link from 'next/link'
import { 
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Briefcase,
  Edit,
  Users,
  BarChart3
} from 'lucide-react'

export default async function ExpertDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { user, profile } = await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const [
    { count: unreadNotifications },
    { data: expert },
    { data: expertStates }
  ] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getLicensingExpertById(supabase, id),
    q.getExpertStatesByExpertId(supabase, id)
  ])

  const [{ data: clients }, { data: applications }] = await Promise.all([
    expert?.user_id ? q.getClientsByExpertId(supabase, expert.user_id) : Promise.resolve({ data: [] }),
    expert?.user_id
      ? q.getApplicationsByAssignedExpertIdSelect(supabase, expert.user_id)
      : Promise.resolve({ data: [] })
  ])

  if (!expert) {
    redirect('/pages/admin/users?tab=experts')
  }

  // Get user profile for email
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('id', expert.user_id)
    .single()

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase()
  }

  type ExpertRow = { id: string; first_name?: string; last_name?: string; status?: string; role?: string; email?: string; phone?: string; expertise?: string; created_at?: string }
  const expertRow = expert as ExpertRow
  const statusCapitalized = (expertRow.status ?? '').charAt(0).toUpperCase() + (expertRow.status ?? '').slice(1)
  const clientCount = clients?.length || 0
  const applicationCount = applications?.length || 0
  type AppRow = { status?: string }
  const activeApplications = (applications as AppRow[] | null)?.filter(a => a.status === 'in_progress' || a.status === 'under_review').length || 0

  return (
    <AdminLayout 
      user={user} 
      profile={profile} 
      unreadNotifications={unreadNotifications || 0}
    >
      <div className="space-y-6">
        {/* Back Link */}
        <Link
          href="/pages/admin/users?tab=experts"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Experts
        </Link>

        {/* Expert Information Section */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                {getInitials(expertRow.first_name ?? '', expertRow.last_name ?? '')}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">{expertRow.first_name ?? ''} {expertRow.last_name ?? ''}</h1>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    expertRow.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {statusCapitalized}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{expertRow.role ?? ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/pages/admin/experts/${expertRow.id}/edit`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit Information
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Mail className="w-4 h-4 text-gray-400" />
              <span><strong>Email:</strong> {userProfile?.email || expertRow.email || 'N/A'}</span>
            </div>
            {expertRow.phone && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Phone className="w-4 h-4 text-gray-400" />
                <span><strong>Phone:</strong> {expertRow.phone}</span>
              </div>
            )}
            {expertRow.expertise && (
              <div className="flex items-center gap-3 text-sm text-gray-600 md:col-span-2">
                <Briefcase className="w-4 h-4 text-gray-400" />
                <span><strong>Expertise:</strong> {expertRow.expertise}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span><strong>Joined:</strong> {formatDate(expertRow.created_at ?? null)}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Users className="w-4 h-4 text-gray-400" />
              <span><strong>Assigned Clients:</strong> {clientCount}</span>
            </div>
          </div>

          {/* Specialization States */}
          {expertStates && expertStates.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Specialization States</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {expertStates.map((es) => (
                  <span
                    key={es.id}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
                  >
                    <MapPin className="w-3 h-3" />
                    {es.state}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Statistics Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{clientCount}</div>
                <div className="text-sm text-gray-600">Assigned Clients</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <Briefcase className="w-5 h-5 text-purple-600" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{applicationCount}</div>
                <div className="text-sm text-gray-600">Total Applications</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-5 h-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{activeApplications}</div>
                <div className="text-sm text-gray-600">Active Applications</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href={`/pages/admin/experts/${expert.id}/clients`}
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <div className="font-semibold text-gray-900">Manage Clients</div>
                <div className="text-sm text-gray-600">View and manage assigned clients</div>
              </div>
            </Link>
            <Link
              href={`/pages/admin/experts/${expert.id}/performance`}
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <BarChart3 className="w-5 h-5 text-purple-600" />
              <div>
                <div className="font-semibold text-gray-900">View Performance</div>
                <div className="text-sm text-gray-600">View performance metrics and statistics</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
