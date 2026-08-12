'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  Home,
  DollarSign,
  UserCog,
  Settings,
  Building2,
  Target,
  BarChart3,
  FileStack,
  ClipboardList,
  BookOpen,
  Layers,
} from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'
import AppHeader from './ui/AppHeader'
import AppSidebar from './ui/AppSidebar'

interface AdminLayoutProps {
  children: React.ReactNode
  user: {
    id?: string
    email?: string | null
  }
  profile: {
    full_name?: string | null
    role?: string | null
  } | null
}

const MENU_ITEMS = [
  { href: '/pages/admin',                      label: 'Dashboard',           icon: Home,      title: 'Dashboard',           subtitle: 'Monitor and manage all licensing cases' },
  { href: '/pages/admin/programs',             label: 'Programs',            icon: ClipboardList,   title: 'Programs',             subtitle: 'Track active license programs, requirements, and progress' },
  { href: '/pages/admin/playbooks',            label: 'Playbooks',           icon: BookOpen, title: 'Playbooks',            subtitle: 'Create and manage reusable playbook templates' },
  { href: '/pages/admin/billing',              label: 'Billing & Invoicing', icon: DollarSign, title: 'Billing & Invoicing',  subtitle: 'View all agencies and their license applications for invoicing' },
  { href: '/pages/admin/agencies',             label: 'Agency',              icon: Building2, title: 'Agencies' },
  { href: '/pages/admin/leads',                label: 'Leads',               icon: Target,    title: 'Leads' },
  { href: '/pages/admin/templates',            label: 'Templates',           icon: FileStack, title: 'Templates' },
  { href: '/pages/admin/reports',              label: 'Reports',             icon: BarChart3, title: 'Reports',              subtitle: 'Pipeline and revenue analytics for your leads' },
  { href: '/pages/admin/users',                label: 'User Management',     icon: UserCog,   title: 'User Management',     subtitle: 'Manage users, clients, and licensing experts' },
  { href: '/pages/admin/plans',               label: 'Feature Plans',       icon: Layers,    title: 'Feature Plans',        subtitle: 'Manage plan tiers and agency feature access' },
  { href: '/pages/admin/configuration',        label: 'Configuration',       icon: Settings,  title: 'Configuration' },
]

export default function AdminLayout({
  children,
  user,
  profile,
}: AdminLayoutProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentPath, setCurrentPath] = useState(pathname)

  useEffect(() => {
    if (pathname !== currentPath) {
      setCurrentPath(pathname)
      setIsLoading(false)
    }
  }, [pathname, currentPath])

  const activePage = [...MENU_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find(item => pathname.startsWith(item.href))

  return (
    <div className="min-h-screen bg-slate-50">
      {isLoading && <LoadingSpinner />}

      <AppHeader
        user={user}
        profile={profile}
        mobileMenuOpen={mobileOpen}
        onMobileMenuToggle={() => setMobileOpen(v => !v)}
        profileUrl="/pages/admin/profile"
        changePasswordUrl="/pages/auth/change-password"
        pageTitle={activePage?.title ?? activePage?.label}
        pageSubtitle={activePage?.subtitle}
        sidebarCollapsed={collapsed}
      />

      <div className="flex pt-[90px]">
        <AppSidebar
          menuItems={MENU_ITEMS}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <main
          className={`flex-1 p-4 md:p-6 transition-all duration-300 text-slate-900 min-w-0 ${
            collapsed ? 'lg:ml-16' : 'lg:ml-64'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
