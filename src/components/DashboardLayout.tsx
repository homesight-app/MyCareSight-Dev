'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  Home,
  UserCircle,
  Users,
  UserCog,
  CalendarDays,
  DollarSign,
  BarChart3,
  Settings,
  Target,
  FileStack,
  ClipboardList,
  Award,
} from 'lucide-react'
import AppHeader from './ui/AppHeader'
import AppSidebar, { type MenuGroupDef, type MenuItemDef } from './ui/AppSidebar'
import LinkNavigationOverlay from './LinkNavigationOverlay'
import UpgradePromptModal from './UpgradePromptModal'
import { getCareVisitsPendingBadgeCountAction } from '@/app/actions/care-visits-badge'
import { getTimeBillingPendingBadgeCountAction } from '@/app/actions/time-billing-badge'
import type { CapabilityKey } from '@/lib/constants/feature-keys'

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
  allowedCapabilities?: CapabilityKey[]
  logoSrc?: string
  logoIconSrc?: string
}

export default function DashboardLayout({
  children,
  user,
  profile,
  careVisitsPendingCount,
  timeBillingPendingCount,
  allowedCapabilities = [],
  logoSrc,
  logoIconSrc,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resolvedCareVisits, setResolvedCareVisits] = useState(careVisitsPendingCount ?? 0)
  const [resolvedTimeBilling, setResolvedTimeBilling] = useState(timeBillingPendingCount ?? 0)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const hasCareOperations = allowedCapabilities.includes('care_operations')
  useEffect(() => {
    if (typeof careVisitsPendingCount === 'number') {
      setResolvedCareVisits(careVisitsPendingCount)
      return
    }
    if (profile?.role !== 'care_coordinator' || !hasCareOperations) return
    let mounted = true
    ;(async () => {
      try {
        const count = await getCareVisitsPendingBadgeCountAction()
        if (mounted) setResolvedCareVisits(count)
      } catch { /* ignore */ }
    })()
    return () => { mounted = false }
  }, [careVisitsPendingCount, profile?.role, pathname, hasCareOperations])

  useEffect(() => {
    if (typeof timeBillingPendingCount === 'number') {
      setResolvedTimeBilling(timeBillingPendingCount)
      return
    }
    if (profile?.role !== 'care_coordinator' || !hasCareOperations) return
    let mounted = true
    ;(async () => {
      const count=await getTimeBillingPendingBadgeCountAction()
      if (mounted) setResolvedTimeBilling(count)
    })()
    return () => { mounted = false }
  }, [timeBillingPendingCount, profile?.role, pathname, hasCareOperations])

  function isAllowed(capability?: CapabilityKey): boolean {
    if (!capability) return true
    return allowedCapabilities.includes(capability)
  }

  const allOwnerItems: (MenuItemDef & { capability?: CapabilityKey })[] = [
    { href: '/pages/agency',                  label: 'Home',           icon: Home,          title: 'Home' },
    { href: '/pages/agency/leads',            label: 'Leads',          icon: Target,        title: 'Leads',          capability: 'client_management' },
    { href: '/pages/agency/clients',          label: 'Clients',        icon: UserCircle,    title: 'Clients',        capability: 'client_management' },
    { href: '/pages/agency/certifications',   label: 'Certifications', icon: Award,         title: 'Certifications', capability: 'agency_compliance' },
    { href: '/pages/agency/programs',         label: 'My Services',    icon: ClipboardList, title: 'My Services',    capability: 'homesights_services' },
    { href: '/pages/agency/care-visits',      label: 'Care Visits',    icon: CalendarDays,  title: 'Care Visits',    capability: 'care_operations', badge: resolvedCareVisits || undefined },
    { href: '/pages/agency/time-billing',     label: 'Time & Billing', icon: DollarSign,    title: 'Time & Billing', capability: 'care_operations', badge: resolvedTimeBilling || undefined },
    { href: '/pages/agency/templates',        label: 'Templates',      icon: FileStack,     title: 'Templates',      capability: 'homesights_services' },
    { href: '/pages/agency/reports',          label: 'Reports',        icon: BarChart3,     title: 'Reports',        capability: 'analytics_reporting' },
    { href: '/pages/agency/user-management',   label: 'User Management', icon: UserCog,       title: 'User Management' },
    { href: '/pages/agency/configuration',    label: 'Configuration',  icon: Settings,      title: 'Configuration' },
  ]

  const coordinatorItems: (MenuItemDef & { capability: CapabilityKey })[] = [
    { href: '/pages/agency/clients',          label: 'Clients',        icon: UserCircle,    title: 'Clients',        capability: 'client_management' },
    { href: '/pages/agency/caregiver',        label: 'Caregivers',     icon: Users,         title: 'Caregivers',     capability: 'caregiver_management' },
    { href: '/pages/agency/care-visits',      label: 'Care Visits',    icon: CalendarDays,  title: 'Care Visits',    capability: 'care_operations', badge: resolvedCareVisits || undefined },
    { href: '/pages/agency/time-billing',     label: 'Time & Billing', icon: DollarSign,    title: 'Time & Billing', capability: 'care_operations', badge: resolvedTimeBilling || undefined },
    { href: '/pages/agency/reports',          label: 'Reports',        icon: BarChart3,     title: 'Reports',        capability: 'analytics_reporting' },
  ]

  const sourceItems = profile?.role === 'care_coordinator' ? coordinatorItems : allOwnerItems

  const menuItems: MenuItemDef[] = sourceItems.map(({ capability, ...item }) => ({
    ...item,
    locked: !isAllowed(capability),
  }))

  const ownerMenuGroups: MenuGroupDef[] | undefined = profile?.role === 'company_owner'
    ? [
        { id: 'client-management', label: 'Client Management', icon: Users, hrefs: ['/pages/agency/leads', '/pages/agency/clients'] },
        { id: 'care-operations', label: 'Care Operations', icon: CalendarDays, hrefs: ['/pages/agency/care-visits', '/pages/agency/time-billing'] },
        { id: 'agency-compliance', label: 'Agency Compliance', icon: Award, hrefs: ['/pages/agency/certifications'] },
        { id: 'analytics-reporting', label: 'Analytics & Reporting', icon: BarChart3, hrefs: ['/pages/agency/reports'] },
        { id: 'homesights-services', label: 'HomeSights Services', icon: FileStack, hrefs: ['/pages/agency/programs', '/pages/agency/templates'] },
        { id: 'administration', label: 'Administration', icon: Settings, hrefs: ['/pages/agency/user-management', '/pages/agency/configuration'] },
      ]
        .map(group => ({
          id: group.id,
          label: group.label,
          icon: group.icon,
          items: group.hrefs
            .map(href => menuItems.find(item => item.href === href))
            .filter((item): item is MenuItemDef => item !== undefined),
        }))
    : undefined

  const primaryMenuItems = ownerMenuGroups
    ? menuItems.filter(item => item.href === '/pages/agency')
    : menuItems

  const activePage = [...menuItems]
    .filter(item => !item.locked)
    .sort((a, b) => b.href.length - a.href.length)
    .find(item => pathname.startsWith(item.href))


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
          menuItems={primaryMenuItems}
          menuGroups={ownerMenuGroups}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          onLockedItemClick={() => setUpgradeOpen(true)}
          logoSrc={logoSrc}
          logoIconSrc={logoIconSrc}
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
