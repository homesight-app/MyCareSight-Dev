'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Bell, MessageSquare, Clock, FileText, Trash2 } from 'lucide-react'
import { flushSync } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
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
  type: string
  created_at: string
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
  initialUnreadCount?: number
}

export default function NotificationDropdown({ 
  userId,
  initialUnreadCount = 0 
}: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [applications, setApplications] = useState<ApplicationNotification[]>([])
  const [adminNotifications, setAdminNotifications] = useState<AdminNotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [isLoading, setIsLoading] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClient()

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

  // Get user role on mount
  useEffect(() => {
    if (!userId) return
    getUserRole()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Fetch initial badge count when userRole is available
  useEffect(() => {
    if (userRole && userId) {
      refreshBadgeCount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole, userId])

  // Always refetch when the dropdown opens. A 30s cache was skipping this when the list
  // already had rows, so the badge (updated via realtime + refreshBadgeCount) could show
  // new unread items while the panel still showed stale notifications (e.g. care coordinators).
  useEffect(() => {
    if (isOpen && userId && userRole) {
      fetchApplicationsWithUnread()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId, userRole])

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

  const getUserRole = async () => {
    try {
      const { data: profile } = await q.getUserProfileRoleById(supabase, userId)
      if (profile) {
        setUserRole(profile.role)
        return profile.role
      }
    } catch (err) {
      console.error('Error fetching user role:', err)
    }
    return null
  }


  // Helper: fetch unread notification items for admin/expert/owner (used in all paths so dropdown is never empty)
  const fetchUnreadNotificationItems = async (): Promise<AdminNotificationItem[]> => {
    if (!userId || !roleSeesInAppNotificationList(userRole)) return []
    const { data: notificationRows } = await q.getUnreadNotificationItems(supabase, userId)
    const allItems = (notificationRows || []).map((n: { id: string; title: string; type: string; created_at: string }) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      created_at: n.created_at
    }))
    return allItems.filter(n => !(n.type === 'general' && n.title === 'New Message'))
  }

  // Optimized: Single query with aggregation using query builder
  const fetchApplicationsWithUnread = useCallback(async () => {
    if (!userRole) return
    
    setIsLoading(true)
    try {
      // Step 1: Get application IDs based on role (single query)
      let applicationIds: string[] = []
      
      if (userRole === 'admin') {
        const { data: conversations } = await q.getConversationApplicationIds(supabase, 100)
        const uniqueAppIds = new Set(conversations?.map((c: { application_id: string }) => c.application_id).filter(Boolean) || [])
        applicationIds = Array.from(uniqueAppIds) as string[]
      } else if (userRole === 'company_owner' || userRole === 'care_coordinator') {
        const { data: up } = await q.getAgencyIdFromProfile(supabase, userId)
        const agencyId = up?.agency_id ?? null
        if (agencyId) {
          const { data: apps } = await q.getApplicationIdsByAgencyId(supabase, agencyId)
          applicationIds = apps?.map((a: { id: string }) => a.id) || []
        }
      } else if (userRole === 'expert') {
        const { data: apps } = await q.getApplicationIdsByAssignedExpertId(supabase, userId)
        applicationIds = apps?.map((a: { id: string }) => a.id) || []
      } else if (userRole === 'care_coordinator' || userRole === 'staff_member') {
        applicationIds = []
      } else {
        applicationIds = []
      }

      let notificationItems: AdminNotificationItem[] = []
      if (roleSeesInAppNotificationList(userRole) && userId) {
        notificationItems = await fetchUnreadNotificationItems()
      }

      if (applicationIds.length === 0) {
        setApplications([])
        setAdminNotifications(notificationItems)
        setUnreadCount(notificationItems.length)
        setIsLoading(false)
        return
      }

      const { data: conversations, error: convError } = await q.getConversationsWithApplications(supabase, applicationIds)
      if (convError) {
        console.error('Error fetching conversations:', convError)
        setApplications([])
        setAdminNotifications(notificationItems)
        setUnreadCount(notificationItems.length)
        setIsLoading(false)
        return
      }

      if (!conversations || conversations.length === 0) {
        setApplications([])
        setAdminNotifications(notificationItems)
        setUnreadCount(notificationItems.length)
        setIsLoading(false)
        return
      }

      // Step 3: Get unread counts using RPC function (user ID not in is_read array)
      const conversationIds = conversations.map(c => c.id)
      
      // Validate inputs before calling RPC
      if (!userId || !Array.isArray(conversationIds) || conversationIds.length === 0) {
        console.warn('Invalid inputs for RPC call in fetchApplicationsWithUnread:', { userId, conversationIds: conversationIds.length })
        setApplications([])
        setAdminNotifications(notificationItems)
        setUnreadCount(notificationItems.length)
        setIsLoading(false)
        return
      }

      const { data: unreadCounts, error: countError } = await q.rpcCountUnreadMessagesForUser(supabase, conversationIds, userId)

      if (countError) {
        console.error('Error counting unread messages in fetchApplicationsWithUnread:', {
          error: countError,
          message: countError.message,
          details: countError.details,
          hint: countError.hint,
          code: countError.code,
          conversationIds: conversationIds.length,
          userId
        })
        setApplications([])
        setAdminNotifications(notificationItems)
        setUnreadCount(notificationItems.length)
        setIsLoading(false)
        return
      }

      // Step 4: Aggregate in memory (minimal processing)
      const unreadCountsByConv: Record<string, number> = {}
      unreadCounts?.forEach((row: { conversation_id: string; unread_count: number }) => {
        unreadCountsByConv[row.conversation_id] = Number(row.unread_count)
      })

      // Step 5: Build result (single pass)
      const appMap = new Map<string, ApplicationNotification>()
      
      conversations.forEach(conv => {
        const appId = conv.application_id
        if (!appId) return
        
        const app = (conv as any).applications
        const unread = unreadCountsByConv[conv.id] || 0
        
        if (unread > 0) {
          const existing = appMap.get(appId)
          if (existing) {
            existing.unread_count += unread
            if (conv.last_message_at && (!existing.last_message_at || conv.last_message_at > existing.last_message_at)) {
              existing.last_message_at = conv.last_message_at
            }
          } else {
            appMap.set(appId, {
              application_id: appId,
              application_name: app.application_name || `Application ${app.state}`,
              state: app.state,
              unread_count: unread,
              last_message_at: conv.last_message_at || ''
            })
          }
        }
      })

      const appNotifications = Array.from(appMap.values())
        .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())

      setApplications(appNotifications)
      let totalUnread = appNotifications.reduce((sum, app) => sum + app.unread_count, 0)
      setAdminNotifications(notificationItems)
      totalUnread += notificationItems.length
      setUnreadCount(totalUnread)
    } catch (err) {
      console.error('Error fetching applications with unread:', err)
      setApplications([])
      setAdminNotifications([])
      setUnreadCount(0)
    } finally {
      setIsLoading(false)
    }
  }, [userRole, userId, supabase])

  // Quick badge count refresh function
  const refreshBadgeCount = useCallback(async () => {
    try {
      let conversationIds: string[] = []
      
      if (userRole === 'admin') {
        const { data: conversations } = await q.getConversationIds(supabase, 500)
        conversationIds = conversations?.map((c: { id: string }) => c.id) || []
      } else if (userRole === 'company_owner' || userRole === 'care_coordinator') {
        const { data: up } = await q.getAgencyIdFromProfile(supabase, userId)
        const agencyId = up?.agency_id ?? null
        const applicationIds: string[] = []
        if (agencyId) {
          const { data } = await q.getApplicationIdsByAgencyId(supabase, agencyId)
          applicationIds.push(...(data?.map((a: { id: string }) => a.id) || []))
        }
        if (applicationIds.length === 0) {
          const { count: notificationsCount } = await q.getUnreadNotificationsCount(supabase, userId)
          setUnreadCount(notificationsCount ?? 0)
          return
        }
        const { data: convData } = await q.getConversationsWithApplications(supabase, applicationIds)
        conversationIds = convData?.map((c: { id: string }) => c.id) || []
      } else if (userRole === 'expert') {
        const { data } = await q.getApplicationIdsByAssignedExpertId(supabase, userId)
        const applicationIds = data?.map((a: { id: string }) => a.id) || []
        if (applicationIds.length === 0) {
          setUnreadCount(0)
          return
        }
        const { data: convData } = await q.getConversationsWithApplications(supabase, applicationIds)
        conversationIds = convData?.map((c: { id: string }) => c.id) || []
      } else if (userRole === 'care_coordinator' || userRole === 'staff_member') {
        const { count: notificationsCount } = await q.getUnreadNotificationsCount(supabase, userId)
        setUnreadCount(notificationsCount ?? 0)
        return
      } else {
        setUnreadCount(0)
        return
      }

      let count = 0
      let countError: { message?: string; details?: unknown; hint?: string; code?: string } | null = null

      if (conversationIds.length > 0 && userId && Array.isArray(conversationIds)) {
        const result = await q.rpcGetTotalUnreadCountForUser(supabase, conversationIds, userId)
        count = result.data ?? 0
        countError = result.error
      }

      let totalCount = countError ? 0 : (count || 0)

      if (roleSeesInAppNotificationList(userRole) && userId) {
        const { data: notificationRows } = await q.getUnreadNotificationsByUserId(supabase, userId)
        const nonMessageCount = (notificationRows || []).filter(n => !(n.type === 'general' && n.title === 'New Message')).length
        totalCount += nonMessageCount
      }

      if (countError && !roleSeesInAppNotificationList(userRole)) {
        console.error('Error counting unread messages:', {
          error: countError,
          message: countError.message,
          details: countError.details,
          hint: countError.hint,
          code: countError.code,
          conversationIds: conversationIds.length,
          userId
        })
      } else {
        setUnreadCount(totalCount)
      }
    } catch (err) {
      console.error('Error refreshing badge:', err)
    }
  }, [userRole, userId, supabase])

  // Debounced refresh for badge count only
  const debouncedRefreshBadge = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
    }

    fetchTimeoutRef.current = setTimeout(async () => {
      // Add a delay to ensure database transaction is fully committed before querying
      // This prevents race conditions where the query runs before the message is visible
      await new Promise(resolve => setTimeout(resolve, 400))
      
      // Always refresh badge count when message arrives (even if dropdown is open)
      await refreshBadgeCount()

      // If the panel is open, reload list content too (same stale-cache issue as on open).
      if (isOpen) {
        setTimeout(() => {
          fetchApplicationsWithUnread()
        }, 500)
      }
    }, DEBOUNCE_MS)
  }, [isOpen, refreshBadgeCount, fetchApplicationsWithUnread])

  // Set up real-time subscription with debouncing (after functions are defined)
  useEffect(() => {
    if (!userId || !userRole) return

    // Use unique channel name per user to avoid conflicts
    const channelName = `notification-messages-${userId}`
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
          // Remove filter - we'll check in the callback to ensure reliability
        },
        async (payload) => {
          const newMessage = payload.new as any
          
          // Skip if message is from current user
          if (!newMessage || newMessage.sender_id === userId) {
            return
          }
          
          // Add a small delay to ensure database transaction is fully committed
          // This prevents race conditions where the query runs before the message is visible
          await new Promise(resolve => setTimeout(resolve, 300))

          debouncedRefreshBadge()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
          // Remove filter - we'll check in the callback
        },
        async (payload) => {
          const updatedMessage = payload.new as any
          
          // Only refresh if message is from another user (not our own messages being marked as read)
          if (updatedMessage && updatedMessage.sender_id !== userId) {
            // Add a small delay to ensure the update is committed
            await new Promise(resolve => setTimeout(resolve, 200))
            
            debouncedRefreshBadge()
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          // Refresh badge count when subscription is established
          refreshBadgeCount()
        } else if (status === 'CHANNEL_ERROR') {
          // Realtime requires messages/notifications in supabase_realtime publication (migration 072)
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              'Realtime subscription failed for', channelName,
              '— ensure migration 072_enable_realtime_messages_notifications has been applied.',
              err?.message ?? ''
            )
          }
        }
      })

    // For admin, expert, owner: subscribe to notifications table so badge updates when new notification arrives
    if (roleSeesInAppNotificationList(userRole) && userId) {
      const notifChannelName = `notification-${userRole}-${userId}`
      const notifChannel = supabase
        .channel(notifChannelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
          },
          async () => {
            await new Promise(resolve => setTimeout(resolve, 300))
            debouncedRefreshBadge()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
        supabase.removeChannel(notifChannel)
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current)
        }
        if (navTimeoutRef.current) {
          clearTimeout(navTimeoutRef.current)
        }
      }
    }

    return () => {
      supabase.removeChannel(channel)
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
      if (navTimeoutRef.current) {
        clearTimeout(navTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userRole, debouncedRefreshBadge, refreshBadgeCount])

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
      await q.markNotificationAsRead(supabase, notif.id)
      setAdminNotifications(prev => prev.filter(n => n.id !== notif.id))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
    setIsOpen(false)
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
      const { error } = await q.deleteNotificationByIdAndUser(supabase, notificationId, userId)
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
        className="relative p-2 hover:bg-white/10 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 sm:w-6 sm:h-6 cursor-pointer hover:text-blue-200 transition-colors" />
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