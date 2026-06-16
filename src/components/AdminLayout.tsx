'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  Home,
  FileBadge,
  FileText,
  DollarSign,
  UserCog,
  Settings,
  Building2,
  Target,
  BarChart3,
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
  unreadNotifications?: number
}

const MENU_ITEMS = [
  { href: '/pages/admin',                    label: 'Dashboard',           icon: Home },
  { href: '/pages/admin/licenses',           label: 'Licenses',            icon: FileBadge },
  { href: '/pages/admin/license-requirements', label: 'License Requirements', icon: FileText },
  { href: '/pages/admin/billing',            label: 'Billing & Invoicing', icon: DollarSign },
  { href: '/pages/admin/agencies',           label: 'Agency',              icon: Building2 },
  { href: '/pages/admin/leads',              label: 'Leads',               icon: Target },
  { href: '/pages/admin/reports',            label: 'Reports',             icon: BarChart3 },
  { href: '/pages/admin/users',              label: 'User Management',     icon: UserCog },
  { href: '/pages/admin/configuration',      label: 'Configuration',       icon: Settings },
]

export default function AdminLayout({
  children,
  user,
  profile,
  unreadNotifications = 0,
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

  return (
    <div className="min-h-screen bg-slate-50">
      {isLoading && <LoadingSpinner />}

      <AppHeader
        user={user}
        profile={profile}
        unreadNotifications={unreadNotifications}
        mobileMenuOpen={mobileOpen}
        onMobileMenuToggle={() => setMobileOpen(v => !v)}
        profileUrl="/pages/admin/profile"
        changePasswordUrl="/pages/auth/change-password"
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
