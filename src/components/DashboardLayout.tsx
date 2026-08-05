'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  Home,
  FileBadge,
  UserCircle,
  Users,
  CalendarDays,
  DollarSign,
  BarChart3,
  Settings,
  Target,
  FileStack,
  ClipboardList,
  Award,
} from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'
import AppHeader from './ui/AppHeader'
import AppSidebar, { type MenuItemDef } from './ui/AppSidebar'
import LinkNavigationOverlay from './LinkNavigationOverlay'
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
  application = null,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resolvedCareVisits, setResolvedCareVisits] = useState(careVisitsPendingCount ?? 0)
  const [resolvedTimeBilling, setResolvedTimeBilling] = useState(timeBillingPendingCount ?? 0)
  const isApplicationDetailPage =
    pathname?.startsWith('/pages/agency/applications/') && pathname !== '/pages/agency/applications'

  useEffect(() => {
    if (typeof careVisitsPendingCount === 'number') {
      setResolvedCareVisits(careVisitsPendingCount)
      return
    }
    if (profile?.role !== 'care_coordinator') return
    let mounted = true
    ;(async () => {
      try {
        const count = await getCareVisitsPendingBadgeCountAction()
        if (mounted) setResolvedCareVisits(count)
      } catch { /* ignore */ }
    })()
    return () => { mounted = false }
  }, [careVisitsPendingCount, profile?.role, pathname])

  useEffect(() => {
    if (typeof timeBillingPendingCount === 'number') {
      setResolvedTimeBilling(timeBillingPendingCount)
      return
    }
    if (profile?.role !== 'care_coordinator') return
    let mounted = true
    const supabase = createClient()
    ;(async () => {
      const { count, error } = await supabase
        .from('visit_financials')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (mounted && !error) setResolvedTimeBilling(count ?? 0)
    })()
    return () => { mounted = false }
  }, [timeBillingPendingCount, profile?.role, pathname])

  const menuItems: MenuItemDef[] = profile?.role === 'care_coordinator'
    ? [
        { href: '/pages/agency/clients',      label: 'Clients',        icon: UserCircle, title: 'Clients' },
        { href: '/pages/agency/caregiver',    label: 'Caregivers',     icon: Users,      title: 'Caregivers' },
        { href: '/pages/agency/care-visits',  label: 'Care Visits',    icon: CalendarDays, badge: resolvedCareVisits || undefined, title: 'Care Visits' },
        { href: '/pages/agency/time-billing', label: 'Time & Billing', icon: DollarSign, badge: resolvedTimeBilling || undefined, title: 'Time & Billing' },
        { href: '/pages/agency/reports',      label: 'Reports',        icon: BarChart3,  title: 'Reports' },
      ]
    : [
        { href: '/pages/agency',                  label: 'Home',           icon: Home,          title: 'Home' },
        { href: '/pages/agency/licenses',         label: 'Licenses',       icon: FileBadge,     title: 'Licenses' },
        { href: '/pages/agency/certifications',   label: 'Certifications', icon: Award,         title: 'Certifications' },
        { href: '/pages/agency/programs',         label: 'Programs',       icon: ClipboardList, title: 'Programs' },
        { href: '/pages/agency/clients',      label: 'Clients',        icon: UserCircle,    title: 'Clients' },
        { href: '/pages/agency/caregiver',    label: 'Caregivers',     icon: Users,       title: 'Caregivers' },
        { href: '/pages/agency/care-visits',  label: 'Care Visits',    icon: CalendarDays, badge: resolvedCareVisits || undefined, title: 'Care Visits' },
        { href: '/pages/agency/time-billing', label: 'Time & Billing', icon: DollarSign,  badge: resolvedTimeBilling || undefined, title: 'Time & Billing' },
        { href: '/pages/agency/leads',        label: 'Leads',          icon: Target,      title: 'Leads' },
        { href: '/pages/agency/templates',    label: 'Templates',      icon: FileStack,   title: 'Templates' },
        { href: '/pages/agency/reports',      label: 'Reports',        icon: BarChart3,   title: 'Reports' },
        { href: '/pages/agency/configuration', label: 'Configuration', icon: Settings,    title: 'Configuration' },
      ]

  const licenseWidget = isApplicationDetailPage && application ? (
    <div className="px-3">
      <div className="text-green-400 text-xs font-medium mb-1">Current License</div>
      <div className="text-xl font-bold text-white mb-2">
        {application.state.length > 2
          ? application.state.substring(0, 2).toUpperCase()
          : application.state.toUpperCase()}
      </div>
      <div className="text-xs font-medium text-slate-400 mb-1">Progress</div>
      <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1">
        <div
          className="bg-green-400 h-1.5 rounded-full transition-all"
          style={{ width: `${application.progress_percentage || 0}%` }}
        />
      </div>
      <div className="text-xs text-slate-500">{application.progress_percentage || 0}% Complete</div>
    </div>
  ) : null

  const activePage = [...menuItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find(item => pathname.startsWith(item.href))

  return (
    <div className="min-h-screen bg-slate-50">
      <LinkNavigationOverlay />

      <AppHeader
        user={user}
        profile={profile}
        unreadNotifications={unreadNotifications}
        mobileMenuOpen={mobileOpen}
        onMobileMenuToggle={() => setMobileOpen(v => !v)}
        profileUrl="/pages/agency/profile"
        changePasswordUrl="/pages/auth/change-password"
        pageTitle={activePage?.title ?? activePage?.label}
        pageSubtitle={activePage?.subtitle}
        sidebarCollapsed={collapsed}
      />

      <div className="flex pt-[90px]">
        <AppSidebar
          menuItems={menuItems}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          extraContent={licenseWidget}
        />

        <main
          className={`flex-1 min-w-0 p-4 sm:p-6 w-full max-w-full transition-all duration-300 overflow-x-hidden text-slate-900 ${
            collapsed ? 'lg:ml-16' : 'lg:ml-64'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
