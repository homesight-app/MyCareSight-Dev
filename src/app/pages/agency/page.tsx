import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import Link from 'next/link'
import {
  Users,
  Clock,
  Bell,
  Calendar,
  FileText,
  AlertCircle
} from 'lucide-react'

export default async function DashboardPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null

  const staffResult = agencyId
    ? await q.getStaffMembersByAgencyId(supabase, agencyId, { status: 'active' })
    : { data: [] }
  const staff = staffResult.data ?? []
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

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const unreadNotifications = (notifications ?? []).filter((n: { is_read?: boolean }) => !n.is_read).length

  const expiringStaffCertifications = staffLicenses?.filter(sl => {
    if (sl.days_until_expiry) {
      return sl.days_until_expiry <= 30 && sl.days_until_expiry > 0
    }
    return false
  }).length || 0

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

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

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
        return 'text-blue-500'
    }
  }

  return (
      <div className="space-y-4 sm:space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div className="text-lg font-bold text-gray-900 mb-0.5">{expiringStaffCertifications}</div>
            <div className="text-xs text-gray-600">Expiring Soon</div>
            <div className="text-xs text-gray-500 mt-0.5">Staff certifications</div>
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-lg p-3 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Bell className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="text-lg font-bold text-gray-900 mb-0.5">{unreadNotifications}</div>
            <div className="text-xs text-gray-600">Notifications</div>
            <div className="text-xs text-gray-500 mt-0.5">Unread messages</div>
          </div>
        </div>

        {/* Main Content Grid - Nursing Staff & Recent Notifications */}
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

            {expiringSoonCount > 0 && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800">
                  {expiringSoonCount} staff member{expiringSoonCount !== 1 ? 's' : ''} have certifications expiring within 30 days
                </p>
              </div>
            )}

            <Link
              href="/pages/agency/caregiver"
              className="block w-full text-center py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-700 font-medium transition-colors"
            >
              Manage Staff Certifications
            </Link>
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
  )
}
