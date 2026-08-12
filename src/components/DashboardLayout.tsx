'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  Home,
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
  Lock,
} from 'lucide-react'
import AppHeader from './ui/AppHeader'
import AppSidebar, { type MenuItemDef } from './ui/AppSidebar'
import LinkNavigationOverlay from './LinkNavigationOverlay'
import UpgradePromptModal from './UpgradePromptModal'
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
  careVisitsPendingCount?: number
  timeBillingPendingCount?: number
  /** null = unrestricted (no plan assigned). Array = the allowed feature keys for this agency. */
  allowedFeatures?: string[] | null
}

export default function DashboardLayout({
  children,
  user,
  profile,
  careVisitsPendingCount,
  timeBillingPendingCount,
  allowedFeatures,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resolvedCareVisits, setResolvedCareVisits] = useState(careVisitsPendingCount ?? 0)
  const [resolvedTimeBilling, setResolvedTimeBilling] = useState(timeBillingPendingCount ?? 0)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
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

  function isAllowed(featureKey: string): boolean {
    if (allowedFeatures == null) return true
    return allowedFeatures.includes(featureKey)
  }

  const allOwnerItems: (MenuItemDef & { featureKey: string })[] = [
    { href: '/pages/agency',                  label: 'Home',           icon: Home,          title: 'Home',           featureKey: 'home' },
    { href: '/pages/agency/certifications',   label: 'Certifications', icon: Award,         title: 'Certifications', featureKey: 'certifications' },
    { href: '/pages/agency/programs',         label: 'Programs',       icon: ClipboardList, title: 'Programs',       featureKey: 'programs' },
    { href: '/pages/agency/clients',          label: 'Clients',        icon: UserCircle,    title: 'Clients',        featureKey: 'clients' },
    { href: '/pages/agency/caregiver',        label: 'Caregivers',     icon: Users,         title: 'Caregivers',     featureKey: 'caregivers' },
    { href: '/pages/agency/care-visits',      label: 'Care Visits',    icon: CalendarDays,  title: 'Care Visits',    featureKey: 'care_visits', badge: resolvedCareVisits || undefined },
    { href: '/pages/agency/time-billing',     label: 'Time & Billing', icon: DollarSign,    title: 'Time & Billing', featureKey: 'time_billing', badge: resolvedTimeBilling || undefined },
    { href: '/pages/agency/leads',            label: 'Leads',          icon: Target,        title: 'Leads',          featureKey: 'leads' },
    { href: '/pages/agency/templates',        label: 'Templates',      icon: FileStack,     title: 'Templates',      featureKey: 'templates' },
    { href: '/pages/agency/reports',          label: 'Reports',        icon: BarChart3,     title: 'Reports',        featureKey: 'reports' },
    { href: '/pages/agency/configuration',    label: 'Configuration',  icon: Settings,      title: 'Configuration',  featureKey: 'configuration' },
  ]

  const coordinatorItems: (MenuItemDef & { featureKey: string })[] = [
    { href: '/pages/agency/clients',          label: 'Clients',        icon: UserCircle,    title: 'Clients',        featureKey: 'clients' },
    { href: '/pages/agency/caregiver',        label: 'Caregivers',     icon: Users,         title: 'Caregivers',     featureKey: 'caregivers' },
    { href: '/pages/agency/care-visits',      label: 'Care Visits',    icon: CalendarDays,  title: 'Care Visits',    featureKey: 'care_visits', badge: resolvedCareVisits || undefined },
    { href: '/pages/agency/time-billing',     label: 'Time & Billing', icon: DollarSign,    title: 'Time & Billing', featureKey: 'time_billing', badge: resolvedTimeBilling || undefined },
    { href: '/pages/agency/reports',          label: 'Reports',        icon: BarChart3,     title: 'Reports',        featureKey: 'reports' },
  ]

  const sourceItems = profile?.role === 'care_coordinator' ? coordinatorItems : allOwnerItems

  // Split into accessible and locked menu items
  const menuItems: MenuItemDef[] = []
  const lockedItems: (MenuItemDef & { featureKey: string })[] = []
  for (const item of sourceItems) {
    if (isAllowed(item.featureKey)) {
      menuItems.push(item)
    } else {
      lockedItems.push(item)
    }
  }

  const activePage = [...menuItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find(item => pathname.startsWith(item.href))

  const lockedSidebarContent = lockedItems.length > 0 ? (
    <div className="space-y-0.5">
      {lockedItems.map(item => {
        const Icon = item.icon
        return (
          <button
            key={item.featureKey}
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-sm text-slate-300 cursor-not-allowed border-l-2 border-transparent pl-[10px] hover:bg-white/5 transition-colors"
            title={`${item.label} — not included in your plan`}
          >
            <div className="relative flex-shrink-0">
              <Icon className="w-5 h-5" strokeWidth={2} />
            </div>
            {!collapsed && (
              <div className="flex items-center justify-between min-w-0 w-full">
                <span className="truncate">{item.label}</span>
                <Lock className="w-3.5 h-3.5 shrink-0 ml-2" strokeWidth={2} />
              </div>
            )}
          </button>
        )
      })}
    </div>
  ) : null

  const collapsed_ = collapsed

  const sidebarExtra = (
    <>
      {lockedSidebarContent && !collapsed_ && (
        <div className="mt-1 border-t border-slate-700/30 pt-1">
          {lockedSidebarContent}
        </div>
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <LinkNavigationOverlay />

      <AppHeader
        user={user}
        profile={profile}
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
          extraContent={sidebarExtra}
        />

        <main
          className={`flex-1 min-w-0 p-4 sm:p-6 w-full max-w-full transition-all duration-300 overflow-x-hidden text-slate-900 ${
            collapsed ? 'lg:ml-16' : 'lg:ml-64'
          }`}
        >
          {children}
        </main>
      </div>

      <UpgradePromptModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  )
}
