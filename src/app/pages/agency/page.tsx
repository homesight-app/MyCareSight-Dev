import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import Link from 'next/link'
import { 
  Shield, 
  Users, 
  Clock, 
  Bell, 
  CheckCircle2, 
  ArrowRight,
  Calendar,
  FileText,
  AlertCircle
} from 'lucide-react'
import ApplyForNewLicenseButton from '@/components/ApplyForNewLicenseButton'

export default async function DashboardPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const supabase = await createClient()

  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  if (profile?.role === 'admin') redirect('/pages/admin')
  if (profile?.role === 'expert') redirect('/pages/expert/clients')

  const { data: agencyRecord } = await q.getClientByCompanyOwnerIdWithAgency(supabase, session.user.id)
  const agencyId = agencyRecord?.agency_id ?? null

  const [ownLicensesResult, agencyLicensesResult, ownAppsResult, agencyAppsResult] = await Promise.all([
    q.getLicensesByCompanyOwnerId(supabase, session.user.id),
    agencyId ? q.getLicensesByAgencyId(supabase, agencyId) : Promise.resolve({ data: [] }),
    q.getApplicationsByCompanyOwnerId(supabase, session.user.id),
    agencyId ? q.getApplicationsByAgencyId(supabase, agencyId) : Promise.resolve({ data: [] }),
  ])
  const seenLicIds = new Set<string>()
  const licenses = [...(ownLicensesResult.data ?? []), ...(agencyLicensesResult.data ?? [])].filter((l) => {
    if (seenLicIds.has(l.id)) return false
    seenLicIds.add(l.id)
    return true
  })
  const seenAppIds = new Set<string>()
  const applicationsData = [...(ownAppsResult.data ?? []), ...(agencyAppsResult.data ?? [])].filter((a) => {
    if (seenAppIds.has(a.id)) return false
    seenAppIds.add(a.id)
    return true
  })
  const applicationsForDashboard = applicationsData.filter(app =>
    ['requested', 'in_progress', 'under_review', 'needs_revision', 'approved'].includes(app.status ?? '')
  )
  const { data: client } = agencyRecord?.id
    ? { data: agencyRecord }
    : await q.getClientByCompanyOwnerId(supabase, session.user.id)
  const { data: staff } = client?.id
    ? await q.getStaffMembersByCompanyOwnerId(supabase, session.user.id, { status: 'active' })
    : { data: [] }
  const staffIds = (staff || []).map((s: { id: string }) => s.id)
  const { data: staffLicensesData } = staffIds.length > 0
    ? await q.getApplicationsByStaffMemberIds(supabase, staffIds)
    : { data: [] }

  type StaffLicenseRow = { id: string; caregiver_member_id: string; license_type: string; license_number: string; state: string; status: string; expiry_date: string | null; days_until_expiry: number | null }
  const staffLicenses: StaffLicenseRow[] = (staffLicensesData || []).map((app: Record<string, unknown>) => ({
    id: app.id as string,
    caregiver_member_id: app.caregiver_member_id as string,
    license_type: (app.application_name as string) || '',
    license_number: (app.license_number as string) || 'N/A',
    state: (app.state as string) || '',
    status: 'active',
    expiry_date: (app.expiry_date as string | null) ?? null,
    days_until_expiry: (app.days_until_expiry as number | null) ?? null,
  }))

  const { count: unreadNotificationsCount } = await q.getUnreadNotificationsCount(supabase, session.user.id)
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  type UnifiedLicense = {
    id: string
    license_name: string
    state: string
    status: string
    expiry_date: string | null
    source: 'license' | 'application'
  }

  const unifiedLicenses: UnifiedLicense[] = [
    ...licenses.map(license => ({
      id: license.id,
      license_name: license.license_name || `${license.state} License`,
      state: license.state || '',
      status: license.status || 'active',
      expiry_date: license.expiry_date ?? null,
      source: 'license' as const,
    })),
    ...applicationsForDashboard.map(app => ({
      id: app.id,
      license_name: app.application_name || `${app.state} License`,
      state: app.state || '',
      // Treat active application lifecycle as pending licenses for dashboard reflection.
      status:
        app.status === 'approved'
          ? 'active'
          : app.status === 'rejected' || app.status === 'closed' || app.status === 'cancelled'
            ? 'expired'
            : 'pending',
      expiry_date: app.expiry_date ?? null,
      source: 'application' as const,
    })),
  ]

  const deriveLicenseStatus = (license: UnifiedLicense): 'active' | 'expiring' | 'expired' => {
    const now = new Date()
    if (license.expiry_date) {
      const expiryDate = new Date(license.expiry_date)
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilExpiry <= 0) return 'expired'
      if (daysUntilExpiry <= 60) return 'expiring'
      return 'active'
    }
    if (license.status === 'expired' || license.status === 'rejected' || license.status === 'closed') {
      return 'expired'
    }
    if (license.status === 'pending') {
      return 'active'
    }
    return 'active'
  }

  const unifiedLicensesWithDerivedStatus = unifiedLicenses.map(license => {
    const derivedStatus = deriveLicenseStatus(license)
    return {
      ...license,
      derivedStatus,
      expiryDate: license.expiry_date ? new Date(license.expiry_date) : null,
    }
  })

  // Calculate statistics
  const activeLicenses = unifiedLicensesWithDerivedStatus.filter(l => l.derivedStatus === 'active').length
  const expiringLicenses = unifiedLicensesWithDerivedStatus.filter(l => l.derivedStatus === 'expiring').length

  const expiringStaffCertifications = staffLicenses?.filter(sl => {
    if (sl.days_until_expiry) {
      return sl.days_until_expiry <= 30 && sl.days_until_expiry > 0
    }
    return false
  }).length || 0

  // Calculate certification status counts for nursing staff
  const today = new Date()
  const certifiedCount = staffLicenses?.filter(sl => {
    if (sl.status === 'active' && sl.days_until_expiry !== null && sl.days_until_expiry !== undefined) {
      return sl.days_until_expiry > 30
    }
    return sl.status === 'active'
  }).length || 0

  const expiringSoonCount = staffLicenses?.filter(sl => {
    if (sl.days_until_expiry) {
      return sl.days_until_expiry <= 30 && sl.days_until_expiry > 0
    }
    return false
  }).length || 0

  const expiredCount = staffLicenses?.filter(sl => {
    if (sl.days_until_expiry !== null && sl.days_until_expiry !== undefined) {
      return sl.days_until_expiry <= 0
    }
    return sl.status === 'expired'
  }).length || 0

  const expiringSoon = expiringLicenses + expiringStaffCertifications
  const unreadNotifications = unreadNotificationsCount ?? 0

  // Debug logs for agency dashboard license reflection issues.
  console.log('[AgencyDashboard][Debug] user', {
    userId: session.user.id,
    email: session.user.email,
    role: profile?.role,
  })
  console.log('[AgencyDashboard][Debug] raw counts', {
    licensesCount: licenses.length,
    applicationsCount: (applicationsData ?? []).length,
    applicationsForDashboardCount: applicationsForDashboard.length,
    unifiedLicensesCount: unifiedLicenses.length,
    unifiedDerivedCount: unifiedLicensesWithDerivedStatus.length,
  })
  console.log(
    '[AgencyDashboard][Debug] raw licenses sample',
    licenses.slice(0, 10).map(l => ({
      id: l.id,
      license_name: l.license_name,
      state: l.state,
      status: l.status,
      expiry_date: l.expiry_date,
      activated_date: l.activated_date,
    }))
  )
  console.log(
    '[AgencyDashboard][Debug] applications for dashboard sample',
    applicationsForDashboard.slice(0, 10).map(a => ({
      id: a.id,
      application_name: a.application_name,
      state: a.state,
      status: a.status,
      expiry_date: a.expiry_date,
      started_date: a.started_date,
      created_at: a.created_at,
    }))
  )
  console.log(
    '[AgencyDashboard][Debug] unified derived sample',
    unifiedLicensesWithDerivedStatus.slice(0, 20).map(l => ({
      id: l.id,
      source: l.source,
      license_name: l.license_name,
      state: l.state,
      rawStatus: l.status,
      derivedStatus: l.derivedStatus,
      expiry_date: l.expiry_date,
    }))
  )
  console.log('[AgencyDashboard][Debug] dashboard card counts', {
    activeLicenses,
    expiringLicenses,
    expiringStaffCertifications,
    expiringSoon: expiringLicenses + expiringStaffCertifications,
  })

  // Get recent licenses
  const recentLicenses = unifiedLicensesWithDerivedStatus
    .slice()
    .sort((a, b) => {
      if (!a.expiry_date) return 1
      if (!b.expiry_date) return -1
      return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
    })
    .slice(0, 2)
    .map(license => ({
      ...license,
      status: license.derivedStatus,
    })) || []
  console.log(
    '[AgencyDashboard][Debug] recent licenses displayed',
    recentLicenses.map(l => ({
      id: l.id,
      source: l.source,
      license_name: l.license_name,
      status: l.status,
      expiry_date: l.expiry_date,
    }))
  )

  // Get all licenses with status for Action Items
  const allLicensesWithStatus = unifiedLicensesWithDerivedStatus.map(license => ({
    ...license,
    status: license.derivedStatus,
  }))

  // Get expiring/expired licenses and pending applications for Action Items
  const expiringLicensesForAction = allLicensesWithStatus
    .filter(license => license.status === 'expiring' || license.status === 'expired')
    .slice(0, 3)
  const pendingApplicationsForAction = unifiedLicensesWithDerivedStatus
    .filter(license => license.source === 'application' && license.status === 'pending')
    .slice(0, 3)

  // Format date helper
  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

  const getStateAbbreviation = (state: string) => {
    if (!state) return 'NA'
    const trimmed = state.trim()
    if (trimmed.length <= 2) return trimmed.toUpperCase()
    const words = trimmed.split(/\s+/).filter(Boolean)
    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase()
    }
    return trimmed.slice(0, 2).toUpperCase()
  }

  // Get notification icon
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'license_expiring':
      case 'staff_certification_expiring':
        return AlertCircle
      case 'application_update':
      case 'document_approved':
      case 'document_rejected':
        return FileText
      case 'general':
        return Bell
      default:
        return Bell
    }
  }

  // Get notification color
  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'license_expiring':
      case 'staff_certification_expiring':
        return 'text-orange-500'
      case 'document_approved':
        return 'text-green-500'
      case 'application_update':
      case 'document_rejected':
        return 'text-blue-500'
      default:
        return 'text-purple-500'
    }
  }

  return (
    <DashboardLayout 
      user={session.user} 
      profile={profile} 
      unreadNotifications={unreadNotifications}
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Welcome Section */}
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-2xl font-bold text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-sm">
            Here&apos;s an overview of your home care licensing operations
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Active Licenses */}
          <div className="bg-white rounded-lg p-3 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <div className="text-lg font-bold text-gray-900 mb-0.5">{activeLicenses}</div>
            <div className="text-xs text-gray-600">Active Licenses</div>
          </div>

          {/* Nursing Staff */}
          <div className="bg-white rounded-lg p-3 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="text-lg font-bold text-gray-900 mb-0.5">{staff?.length || 0}</div>
            <div className="text-xs text-gray-600">Nursing Staff</div>
            <div className="text-xs text-gray-500 mt-0.5">Active and certified</div>
          </div>

          {/* Expiring Soon */}
          <div className="bg-white rounded-lg p-3 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="w-4 h-4 text-orange-600" />
              </div>
            </div>
            <div className="text-lg font-bold text-gray-900 mb-0.5">{expiringSoon}</div>
            <div className="text-xs text-gray-600">Expiring Soon</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {expiringLicenses} licenses, {expiringStaffCertifications} certifications
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-lg p-3 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Bell className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <div className="text-lg font-bold text-gray-900 mb-0.5">{unreadNotifications}</div>
            <div className="text-xs text-gray-600">Notifications</div>
            <div className="text-xs text-gray-500 mt-0.5">Unread messages</div>
          </div>
        </div>

        {/* Main Content Grid - Nursing Staff & Action Items */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Nursing Staff Section */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Nursing Staff</h2>
              <span className="text-sm text-gray-600">{staff?.length || 0} total</span>
            </div>

            {/* Certification Status Breakdown */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-gray-700">Certified</span>
                <span className="ml-auto text-sm font-semibold text-gray-900">{certifiedCount}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-sm text-gray-700">Expiring Soon</span>
                <span className="ml-auto text-sm font-semibold text-gray-900">{expiringSoonCount}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-sm text-gray-700">Expired</span>
                <span className="ml-auto text-sm font-semibold text-gray-900">{expiredCount}</span>
              </div>
            </div>

            {/* Warning Message */}
            {expiringSoonCount > 0 && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800">
                  {expiringSoonCount} staff member{expiringSoonCount !== 1 ? 's' : ''} have certifications expiring within 30 days
                </p>
              </div>
            )}

            {/* Manage Staff Certifications Button */}
            <Link
              href="/pages/agency/caregiver"
              className="block w-full text-center py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-700 font-medium transition-colors"
            >
              Manage Staff Certifications
            </Link>
          </div>

          {/* Action Items Section */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Action Items</h2>
            </div>

            {/* License Information Cards */}
            <div className="space-y-3 mb-4">
              {expiringLicensesForAction.length > 0 || pendingApplicationsForAction.length > 0 ? (
                [...expiringLicensesForAction, ...pendingApplicationsForAction].slice(0, 3).map((license) => (
                  <div key={license.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-gray-900">
                        {license.state} {license.source === 'application' ? 'Application' : 'License'}
                      </div>
                      {license.status === 'expiring' && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          expiring
                        </span>
                      )}
                      {license.status === 'pending' && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          pending
                        </span>
                      )}
                    </div>
                    {license.expiryDate && (
                      <div className="text-sm text-red-600 font-medium">
                        Expires {formatDate(license.expiryDate)}
                      </div>
                    )}
                    {!license.expiryDate && license.status === 'pending' && (
                      <div className="text-sm text-blue-600 font-medium">
                        In progress
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No action items</p>
                </div>
              )}
            </div>

            {/* Apply for New License Button */}
            <ApplyForNewLicenseButton />
          </div>
        </div>

        {/* Additional Sections - Your Licenses & Recent Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Your Licenses */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Your Licenses</h2>
              <Link 
                href="/pages/agency/licenses"
                className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
              >
                View All
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="space-y-4">
              {recentLicenses.length > 0 ? (
                recentLicenses.map((license) => (
                  <div key={license.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white ${
                      getStateAbbreviation(license.state) === 'CA' ? 'bg-green-500' : 
                      getStateAbbreviation(license.state) === 'TX' ? 'bg-orange-500' : 
                      'bg-blue-500'
                    }`}>
                      {getStateAbbreviation(license.state)}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{license.license_name}</div>
                      <div className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4" />
                        Expires {formatDate(license.expiryDate)}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      license.status === 'active' 
                        ? 'bg-black text-white' 
                        : license.status === 'expiring'
                        ? 'bg-gray-200 text-gray-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {license.status === 'active' ? 'active' : license.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No licenses yet</p>
                  <Link 
                    href="/pages/agency/licenses"
                    className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block"
                  >
                    Add your first license
                  </Link>
                </div>
              )}
            </div>

            {recentLicenses.length > 0 && (
              <div className="mt-4">
                <Link
                  href="/pages/agency/licenses"
                  className="block w-full text-center py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
                >
                  Manage All Licenses
                </Link>
              </div>
            )}
          </div>

          {/* Recent Notifications */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Recent Notifications</h2>
              {unreadNotifications > 0 && (
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                  {unreadNotifications} new
                </span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto overflow-x-hidden space-y-3 pr-1 -mr-1">
              {notifications && notifications.length > 0 ? (
                notifications.map((notification) => {
                  const Icon = getNotificationIcon(notification.type)
                  return (
                    <div key={notification.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg shrink-0">
                      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${getNotificationColor(notification.type)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{notification.title}</div>
                        <div className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(notification.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Bell className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No notifications</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
