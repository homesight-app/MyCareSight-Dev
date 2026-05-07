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
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Eye
} from 'lucide-react'

export default async function ClientDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {

  const { user, profile } = await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const [
    { count: unreadNotifications },
    { data: client },
    { data: clientStates },
    { data: cases },
    { data: conversations }
  ] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getClientById(supabase, id),
    q.getClientStatesByClientId(supabase, id),
    q.getCasesByClientId(supabase, id),
    q.getConversationsByClientIds(supabase, [id])
  ])

  if (!client) {
    redirect('/pages/admin/clients')
  }

  const { data: applications } = client.company_owner_id
    ? await q.getApplicationsByCompanyOwnerId(supabase, client.company_owner_id)
    : { data: [] }
  const { data: expertData } = client.expert_id
    ? await q.getLicensingExpertByUserId(supabase, client.expert_id)
    : { data: null }
  const expert = (expertData ?? null) as { first_name?: string; last_name?: string } | null

  const conversationIds = conversations?.map((c: { id: string }) => c.id) || []
  const { data: unreadRpcRows } =
    conversationIds.length > 0
      ? await q.rpcCountUnreadMessagesForUser(supabase, conversationIds, user.id)
      : { data: [] }

  const unreadCount =
    (unreadRpcRows ?? []).reduce(
      (sum: number, row: { unread_count: number }) => sum + Number(row.unread_count),
      0
    ) || 0

  // Calculate statistics from cases
  const activeLicenses = cases?.filter(c => c.status === 'approved').length || 0
  const expiringLicenses = cases?.filter(c => c.status === 'under_review').length || 0
  const expiredLicenses = cases?.filter(c => c.status === 'rejected').length || 0
  const avgProgress = cases && cases.length > 0
    ? Math.round(cases.reduce((acc, c) => acc + (c.progress_percentage || 0), 0) / cases.length)
    : 0
    
  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const formatShortDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const statusCapitalized = client.status.charAt(0).toUpperCase() + client.status.slice(1)
  const expertName = expert ? `${expert.first_name} ${expert.last_name}` : 'Unassigned'

  // Create a map of applications by state and name to match with cases
  const applicationsByStateAndName = new Map<string, string>()
  if (applications) {
    applications.forEach((app: { state: string; application_name: string; id: string }) => {
      const key = `${app.state}_${app.application_name}`
      applicationsByStateAndName.set(key, app.id)
    })
  }

  // Helper function to find application ID for a case
  const getApplicationIdForCase = (caseItem: any): string | null => {
    // Try to match by state and business_name/application_name
    const key = `${caseItem.state}_${caseItem.business_name}`
    return applicationsByStateAndName.get(key) || null
  }

  return (
    <AdminLayout 
      user={user} 
      profile={profile} 
      unreadNotifications={unreadNotifications || 0}
    >
      <div className="space-y-6">
        {/* Back Link */}
        <Link
          href="/pages/admin/users?tab=clients"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Clients
        </Link>

        {/* Client Information Section */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                {getInitials(client.company_name)}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">{client.company_name}</h1>
                  <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                    {statusCapitalized}
                  </span>
                </div>
                <p className="text-sm text-gray-600">Agency Admin ID: {client.id.substring(0, 8)}</p>
              </div>
            </div>
            {/* <div className="flex items-center gap-2">
              <MessagesButton clientId={client.id} unreadCount={unreadCount} />
            </div> */}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <User className="w-4 h-4 text-gray-400" />
              <span><strong>Contact Person:</strong> {client.contact_name}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Mail className="w-4 h-4 text-gray-400" />
              <span><strong>Email Address:</strong> {client.contact_email}</span>
            </div>
            {client.contact_phone && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Phone className="w-4 h-4 text-gray-400" />
                <span><strong>Phone Number:</strong> {client.contact_phone}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <User className="w-4 h-4 text-gray-400" />
              <span><strong>Assigned Expert:</strong> {expertName}</span>
            </div>
            {client.start_date && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span><strong>Start Date:</strong> {formatDate(client.start_date)}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span><strong>Last Contact:</strong> {formatDate(client.updated_at)}</span>
            </div>
          </div>

          {/* Operating States */}
          {clientStates && clientStates.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Operating States</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {clientStates.map((cs) => (
                  <span
                    key={cs.id}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
                  >
                    <MapPin className="w-3 h-3" />
                    {cs.state}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Overall Application Progress */}
          {avgProgress > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">Overall Application Progress</h3>
                <span className="text-sm font-semibold text-gray-900">{avgProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gray-800 h-3 rounded-full transition-all"
                  style={{ width: `${avgProgress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Client Licenses Section */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Agency Admin Licenses</h2>
            <p className="text-sm text-gray-600">View all current, expiring, and expired licenses for this Agency Admin</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{activeLicenses}</div>
                  <div className="text-sm text-gray-600">Active Licenses</div>
                </div>
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{expiringLicenses}</div>
                  <div className="text-sm text-gray-600">Expiring Soon</div>
                </div>
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-red-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{expiredLicenses}</div>
                  <div className="text-sm text-gray-600">Expired</div>
                </div>
              </div>
            </div>
          </div>

          {/* Active Licenses List */}
          {cases && cases.filter(c => c.status === 'approved').length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">Active Licenses</h3>
              </div>
              <div className="space-y-4">
                {cases
                  .filter(c => c.status === 'approved')
                  .map((caseItem) => (
                    <div
                      key={caseItem.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                              <MapPin className="w-3 h-3" />
                              {caseItem.state}
                            </span>
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                              Active
                            </span>
                          </div>
                          <h4 className="font-semibold text-gray-900 mb-1">{caseItem.business_name}</h4>
                          <p className="text-sm text-gray-600 mb-2">License #{caseItem.case_id}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>Issued: {formatShortDate(caseItem.started_date)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>Expires: {formatShortDate(caseItem.last_activity)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              <span>v1</span>
                            </div>
                          </div>
                        </div>
                        {(() => {
                          const applicationId = getApplicationIdForCase(caseItem)
                          return applicationId ? (
                            <Link
                              href={`/pages/admin/licenses/applications/${applicationId}`}
                              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4" />
                              View Details
                            </Link>
                          ) : (
                            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-2" disabled>
                              <Eye className="w-4 h-4" />
                              View Details
                            </button>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* License Applications Section */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 mb-1">License Applications</h2>
            <p className="text-sm text-gray-600">View and manage all applications for this Agency Admin</p>
          </div>

          {applications && applications.length > 0 ? (
            <div className="space-y-4">
              {applications
                .filter(app => app.status !== 'approved')
                .map((application) => (
                  <div
                    key={application.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <h4 className="font-semibold text-gray-900">{application.application_name}</h4>
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                            <MapPin className="w-3 h-3" />
                            {application.state}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {application.status === 'under_review' && application.submitted_date
                            ? `Application submitted on ${formatShortDate(application.submitted_date)}`
                            : application.status === 'under_review'
                            ? `Application submitted on ${formatShortDate(application.updated_at)}`
                            : 'Application in progress'}
                        </p>
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div
                            className="bg-gray-800 h-2 rounded-full transition-all"
                            style={{ width: `${application.progress_percentage || 0}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500">{application.progress_percentage || 0}% complete</p>
                      </div>
                      <Link
                        href={`/pages/admin/licenses/applications/${application.id}`}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium whitespace-nowrap"
                      >
                        View Application
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No applications found</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
