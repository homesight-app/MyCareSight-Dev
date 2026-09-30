'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Bell, MessageSquare, Clock, FileText, Trash2 } from 'lucide-react'
import { flushSync } from 'react-dom'
import * as q from '@/app/actions/query-bridge'
import {
  getNotificationBadgeSnapshotAction,
  getNotificationDropdownSnapshotAction,
} from '@/app/actions/notification-dropdown'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import LoadingSpinner from './LoadingSpinner'

interface ApplicationNotification {
  application_id: string
  application_name: string
  state: string
  unread_count: number
  last_message_at: string
}

interface AdminNotificationItem {
  id: string
  title: string
  message: string | null
  type: string
  created_at: string
  action_url: string | null
}

/** Matches title built in DB: notify_agency_staff_schedule_assignment_request */
const SCHEDULE_ASSIGNMENT_REQUEST_SNIPPET = 'requested assignment to an open visit'

/** Matches title built in DB: notify_agency_staff_schedule_assignment_request_cancelled */
const SCHEDULE_ASSIGNMENT_CANCEL_SNIPPET = 'withdrew their assignment request for an open visit'

/** Matches titles from 056_notify_caregiver_assignment_approve_decline.sql */
const VISIT_ASSIGNMENT_CAREGIVER_PREFIX = 'Visit assignment '

function roleSeesInAppNotificationList(role: string | null): boolean {
  return (
    role === 'admin' ||
    role === 'expert' ||
    role === 'company_owner' ||
    role === 'care_coordinator' ||
    role === 'staff_member'
  )
}

interface NotificationDropdownProps {
  userId: string
  userRole: string | null
  initialUnreadCount?: number
}

export default function NotificationDropdown({ 
  userId,
  userRole,
  initialUnreadCount = 0 
}: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [applications, setApplications] = useState<ApplicationNotification[]>([])
  const [adminNotifications, setAdminNotifications] = useState<AdminNotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [isLoading, setIsLoading] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const initialBadgeLoadedRef = useRef(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const pendingRouteRef = useRef<string | null>(null)
  const navTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const DEBOUNCE_MS = 500 // 500ms debounce for faster badge updates

  const currentRouteKey = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

  useEffect(() => {
    if (!isNavigating || !pendingRouteRef.current) return
    // Keep spinner until the target route (path + query) is actually reached.
    if (currentRouteKey !== pendingRouteRef.current) return

    setIsNavigating(false)
    pendingRouteRef.current = null
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current)
      navTimeoutRef.current = null
    }
  }, [currentRouteKey, isNavigating])

  const navigateWithLoading = useCallback(
    (href: string) => {
      pendingRouteRef.current = href
      // Force paint of full-page loading overlay before route navigation begins.
      flushSync(() => {
        setIsNavigating(true)
      })
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
      // Fallback clear in case navigation is interrupted.
      navTimeoutRef.current = setTimeout(() => {
        setIsNavigating(false)
        pendingRouteRef.current = null
        navTimeoutRef.current = null
      }, 10000)
      requestAnimationFrame(() => {
        router.push(href)
      })
    },
    [router]
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const refreshDropdown = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getNotificationDropdownSnapshotAction()
      if (result.error || !result.data) throw new Error(result.error?.message ?? 'Unable to load notifications')
      setApplications(result.data.applications)
      setAdminNotifications(result.data.notifications)
      setUnreadCount(result.data.unreadCount)
    } catch (err) {
      console.error('Error fetching applications with unread:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshBadgeCount = useCallback(async () => {
    try {
      const result = await getNotificationBadgeSnapshotAction()
      if (result.error || !result.data) throw new Error(result.error?.message ?? 'Unable to count notifications')
      setUnreadCount(result.data.unreadCount)
    } catch (err) {
      console.error('Error refreshing badge:', err)
    }
  }, [])

  useEffect(() => {
    if (!userId || !userRole || initialBadgeLoadedRef.current) return
    initialBadgeLoadedRef.current = true
    void refreshBadgeCount()
  }, [refreshBadgeCount, userId, userRole])

  useEffect(() => {
    if (isOpen && userId && userRole) void refreshDropdown()
  }, [isOpen, refreshDropdown, userId, userRole])

  const debouncedRefreshBadge = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
    }

    fetchTimeoutRef.current = setTimeout(async () => {
      await new Promise(resolve => setTimeout(resolve, 400))
      if (isOpen) await refreshDropdown()
      else await refreshBadgeCount()
    }, DEBOUNCE_MS)
  }, [isOpen, refreshBadgeCount, refreshDropdown])
  // Poll through the application-owned server boundary until an Azure-compatible
  // event channel is selected. Focus/visibility refreshes keep returning users current.
  useEffect(() => {
    if (!userId || !userRole) return
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') debouncedRefreshBadge()
    }
    const interval = window.setInterval(refreshWhenVisible, 30000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
    }
  }, [userId, userRole, debouncedRefreshBadge])

  const handleApplicationClick = (applicationId: string) => {
    setIsOpen(false)
    
    // Navigate based on user role with fromNotification flag
    if (userRole === 'admin') {
      navigateWithLoading(`/pages/admin/licenses/applications/${applicationId}?fromNotification=true`)
    } else if (userRole === 'company_owner') {
      navigateWithLoading(`/pages/agency/applications/${applicationId}?fromNotification=true`)
    } else if (userRole === 'expert') {
      navigateWithLoading(`/pages/expert/applications/${applicationId}?fromNotification=true`)
    }
  }

  const handleAdminNotificationClick = async (notif: AdminNotificationItem) => {
    try {
      await q.markNotificationAsRead(notif.id)
      setAdminNotifications(prev => prev.filter(n => n.id !== notif.id))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
    setIsOpen(false)
    if (notif.action_url) {
      navigateWithLoading(notif.action_url)
      return
    }
    if (
      notif.title.includes(SCHEDULE_ASSIGNMENT_REQUEST_SNIPPET) ||
      notif.title.includes(SCHEDULE_ASSIGNMENT_CANCEL_SNIPPET)
    ) {
      navigateWithLoading('/pages/agency/care-visits?tab=requests')
      return
    }
    if (userRole === 'staff_member' && notif.title.startsWith(VISIT_ASSIGNMENT_CAREGIVER_PREFIX)) {
      navigateWithLoading('/pages/caregiver/my-care-visits')
      return
    }
    if (userRole === 'expert') {
      navigateWithLoading('/pages/expert/applications')
    } else if (userRole === 'company_owner') {
      navigateWithLoading('/pages/agency/applications')
    } else if (userRole === 'care_coordinator') {
      navigateWithLoading('/pages/agency/care-visits')
    } else if (userRole === 'staff_member') {
      navigateWithLoading('/pages/caregiver')
    } else {
      navigateWithLoading('/pages/admin/licenses')
    }
  }

  const handleDeleteNotification = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation()
    try {
      const { error } = await q.deleteNotificationByIdAndUser(notificationId, userId)
      if (error) throw error
      setAdminNotifications(prev => prev.filter(n => n.id !== notificationId))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Error deleting notification:', err)
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No messages'
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInMins = Math.floor(diffInMs / 60000)
    const diffInHours = Math.floor(diffInMs / 3600000)
    const diffInDays = Math.floor(diffInMs / 86400000)

    if (diffInMins < 1) return 'Just now'
    if (diffInMins < 60) return `${diffInMins}m ago`
    if (diffInHours < 24) return `${diffInHours}h ago`
    if (diffInDays < 7) return `${diffInDays}d ago`
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {isNavigating ? <LoadingSpinner overlayZClass="z-[200]" /> : null}

      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 sm:w-6 sm:h-6 cursor-pointer hover:text-blue-600 transition-colors" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount }
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[400px] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <h3 className="font-semibold text-gray-900">{roleSeesInAppNotificationList(userRole) ? 'Notifications' : 'Messages'}</h3>
            {unreadCount > 0 && (
              <span className="text-sm text-gray-600">
                {unreadCount} unread
              </span>
            )}
          </div>

          {/* Scrollable body: admin notifications + applications list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Admin: New Application Request; Expert: Application Assigned; Owner: Document Approved */}
          {roleSeesInAppNotificationList(userRole) && adminNotifications.length > 0 && (
            <div className="border-b border-gray-200">
              {adminNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => {
                    handleAdminNotificationClick(notif)
                  }}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer bg-amber-50/50 flex items-start gap-2"
                >
                  <FileText className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900">{notif.title}</div>
                    {notif.message && (
                      <div className="text-xs text-gray-600 mt-0.5 truncate">{notif.message}</div>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      {formatDate(notif.created_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteNotification(e, notif.id)}
                    className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    aria-label="Delete notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Applications List (unread messages) */}
          <div>
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-sm">Loading...</p>
              </div>
            ) : applications.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {roleSeesInAppNotificationList(userRole) && adminNotifications.length > 0 && (
                  <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Unread messages</div>
                )}
                {applications.map((app) => (
                  <div
                    key={app.application_id}
                    onClick={() => handleApplicationClick(app.application_id)}
                    className="p-4 hover:bg-gray-50 transition-colors cursor-pointer bg-blue-50/50"
                  >
                    <div className="flex items-start gap-3">
                      <MessageSquare className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-semibold text-sm text-gray-900">
                              {app.application_name}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {app.state} • {app.unread_count} unread {app.unread_count === 1 ? 'message' : 'messages'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {app.unread_count > 0 && (
                              <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {app.unread_count > 9 ? '9+' : app.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {formatDate(app.last_message_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : adminNotifications.length > 0 && roleSeesInAppNotificationList(userRole) ? (
              <div className="p-6 text-center text-gray-500">
                <p className="text-sm">No unread messages</p>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">{roleSeesInAppNotificationList(userRole) ? 'No notifications' : 'No unread messages'}</p>
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
