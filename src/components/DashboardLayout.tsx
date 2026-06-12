'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { 
  Home,
  Medal,
  Users,
  LogOut,
  ChevronLeft,
  Menu,
  X,
  BarChart3,
  UserCircle,
  CalendarDays,
  DollarSign,
  Settings,
  Target,
} from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import UserDropdown from './UserDropdown'
import LinkNavigationOverlay from './LinkNavigationOverlay'
import NotificationDropdown from './NotificationDropdown'
import { createClient } from '@/lib/supabase/client'
import { getCareVisitsPendingBadgeCountAction } from '@/app/actions/care-visits-badge'

interface DashboardLayoutProps {
  children: React.ReactNode
  user: {
    id?: string
    email?: string | null
  }
  profile: {
    full_name?: string | null
    role?: string | null
  } | null
  unreadNotifications?: number
  careVisitsPendingCount?: number
  /** Completed visits awaiting hours approval (visit_financials.status = pending). */
  timeBillingPendingCount?: number
  application?: {
    id: string
    state: string
    progress_percentage: number | null
  } | null
  activeLicenseTab?: 'overview' | 'checklist' | 'documents'
  onLicenseTabChange?: (tab: 'overview' | 'checklist' | 'documents') => void
}

export default function DashboardLayout({ 
  children, 
  user, 
  profile,
  unreadNotifications = 0,
  careVisitsPendingCount,
  timeBillingPendingCount,
  application = null
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [resolvedCareVisitsPendingCount, setResolvedCareVisitsPendingCount] = useState(careVisitsPendingCount ?? 0)
  const [resolvedTimeBillingPendingCount, setResolvedTimeBillingPendingCount] = useState(timeBillingPendingCount ?? 0)
  const isApplicationDetailPage = pathname?.startsWith('/pages/agency/applications/') && pathname !== '/pages/agency/applications'

  useEffect(() => {
    if (typeof careVisitsPendingCount === 'number') {
      setResolvedCareVisitsPendingCount(careVisitsPendingCount)
      return
    }
    if (profile?.role !== 'care_coordinator') return

    let isMounted = true
    ;(async () => {
      try {
        const count = await getCareVisitsPendingBadgeCountAction()
        if (!isMounted) return
        setResolvedCareVisitsPendingCount(count)
      } catch {
        if (!isMounted) return
      }
    })()

    return () => {
      isMounted = false
    }
  }, [careVisitsPendingCount, profile?.role, pathname])

  useEffect(() => {
    if (typeof timeBillingPendingCount === 'number') {
      setResolvedTimeBillingPendingCount(timeBillingPendingCount)
      return
    }
    if (profile?.role !== 'care_coordinator') return

    let isMounted = true
    const supabase = createClient()
    ;(async () => {
      const { count, error } = await supabase
        .from('visit_financials')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (!isMounted || error) return
      setResolvedTimeBillingPendingCount(count ?? 0)
    })()

    return () => {
      isMounted = false
    }
  }, [timeBillingPendingCount, profile?.role, pathname])

  const menuItems = profile?.role === 'care_coordinator'
    ? [
        { href: '/pages/agency/clients', label: 'Clients', icon: UserCircle },
        { href: '/pages/agency/caregiver', label: 'Caregivers', icon: Users },
        { href: '/pages/agency/care-visits', label: 'Care Visits', icon: CalendarDays },
        { href: '/pages/agency/time-billing', label: 'Time & Billing', icon: DollarSign },
        { href: '/pages/agency/reports', label: 'Reports', icon: BarChart3 },
      ]
    : [
        { href: '/pages/agency', label: 'Home', icon: Home },
        { href: '/pages/agency/licenses', label: 'Licenses', icon: Medal },
        { href: '/pages/agency/clients', label: 'Clients', icon: UserCircle },
        { href: '/pages/agency/caregiver', label: 'Caregivers', icon: Users },
        { href: '/pages/agency/care-visits', label: 'Care Visits', icon: CalendarDays },
        { href: '/pages/agency/time-billing', label: 'Time & Billing', icon: DollarSign },
        { href: '/pages/agency/leads', label: 'Leads', icon: Target },
        { href: '/pages/agency/reports', label: 'Reports', icon: BarChart3 },
        { href: '/pages/agency/configuration', label: 'Configuration', icon: Settings },
        // { href: '/pages/agency/messages', label: 'Messages', icon: MessageSquare },
      ]

  const getInitials = (name: string | null | undefined, email: string | null | undefined) => {
    if (name) {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return 'U'
  }


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header - Fixed */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative w-20 h-12 sm:w-40 sm:h-16">
                <Image
                  src="/cropped-HomeSights-NEWLOGO-1.png"
                  alt="Home Sights Consulting Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Notifications */}
            {user.id && (
              <NotificationDropdown 
                userId={user.id}
                initialUnreadCount={unreadNotifications}
              />
            )}

            {/* User Dropdown */}
            <UserDropdown 
              user={user} 
              profile={profile} 
              profileUrl="/pages/agency/profile"
              changePasswordUrl="/pages/auth/change-password"
            />
          </div>
        </div>
      </header>

      <div className="flex relative pt-[73px]">
        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div 
            className="fixed top-[73px] left-0 right-0 bottom-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar - Fixed */}
        <aside className={`
          bg-white shadow-lg transition-all duration-300 
          fixed top-[73px] left-0 bottom-0 z-40
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarCollapsed ? 'w-16' : 'w-64'}
          overflow-y-auto
        `}>
          <div className="p-4 h-full flex flex-col">
            <div>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="w-full flex items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors mb-4"
              >
                <ChevronLeft className={`w-5 h-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
              </button>

              {!sidebarCollapsed && (
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-3">
                  Main Menu
                </div>
              )}

              <nav className="space-y-1">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href || (pathname.startsWith(item.href + '/') && item.href !== '/pages/agency')
                  // const isActive = pathname === item.href
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <LinkNavigationOverlay />
                      <div className="relative flex-shrink-0">
                        <Icon className="w-5 h-5" />
                        {sidebarCollapsed && item.href === '/pages/agency/care-visits' && resolvedCareVisitsPendingCount > 0 ? (
                          <span className="absolute -top-2 -right-2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 min-w-[1rem] text-center leading-none">
                            {resolvedCareVisitsPendingCount}
                          </span>
                        ) : null}
                        {sidebarCollapsed && item.href === '/pages/agency/time-billing' && resolvedTimeBillingPendingCount > 0 ? (
                          <span className="absolute -top-2 -right-2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 min-w-[1rem] text-center leading-none">
                            {resolvedTimeBillingPendingCount}
                          </span>
                        ) : null}
                      </div>
                      {!sidebarCollapsed ? (
                        <div className="flex items-center justify-between min-w-0 w-full">
                          <span>{item.label}</span>
                          {item.href === '/pages/agency/care-visits' && resolvedCareVisitsPendingCount > 0 ? (
                            <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 min-w-[1.25rem] text-center">
                              {resolvedCareVisitsPendingCount}
                            </span>
                          ) : null}
                          {item.href === '/pages/agency/time-billing' && resolvedTimeBillingPendingCount > 0 ? (
                            <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 min-w-[1.25rem] text-center">
                              {resolvedTimeBillingPendingCount}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </Link>
                  )
                })}
              </nav>
            </div>

            {/* Current License Status - Only show on application detail page */}
            {isApplicationDetailPage && application && !sidebarCollapsed && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="text-blue-600 text-sm font-medium mb-2">Current License</div>
                <div className="text-2xl font-bold text-gray-900 mb-3">
                  {application.state.length > 2 ? application.state.substring(0, 2).toUpperCase() : application.state.toUpperCase()}
                </div>
                <div className="text-sm font-medium text-gray-700 mb-2">Progress</div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-gray-900 h-2 rounded-full transition-all"
                    style={{ width: `${application.progress_percentage || 0}%` }}
                  />
                </div>
                <div className="text-sm text-gray-600">{application.progress_percentage || 0}% Complete</div>
              </div>
            )}

            {/* License Management - Only show on application detail page */}
            {/* {isApplicationDetailPage && !sidebarCollapsed && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-3">
                  License Management
                </div>
                <nav className="space-y-1">
                  {[
                    { id: 'overview', label: 'Overview', icon: Grid3x3 },
                    { id: 'checklist', label: 'Checklist', icon: CheckSquare },
                    { id: 'documents', label: 'Documents', icon: FileText },
                  ].map((item) => {
                    const Icon = item.icon
                    const isActive = activeLicenseTab === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => onLicenseTabChange?.(item.id as typeof activeLicenseTab)}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${
                          isActive
                            ? 'bg-gray-100 text-gray-900 font-semibold'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>
            )} */}

            <div className="mt-auto pt-4 border-t border-gray-200">
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-red-600 hover:bg-red-50 w-full transition-all"
                >
                  <LogOut className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span>Logout</span>}
                </button>
              </form>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className={`flex-1 min-w-0 p-4 sm:p-6 w-full max-w-full transition-all duration-300 overflow-x-hidden text-gray-900 ${
            sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}


