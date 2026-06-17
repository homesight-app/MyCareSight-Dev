'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Users, Building2, FileText } from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'
import AppHeader from './ui/AppHeader'
import AppSidebar, { type MenuItemDef } from './ui/AppSidebar'

interface ExpertDashboardLayoutProps {
  children: React.ReactNode
  user: {
    id?: string
    email?: string | null
  } | null
  profile: {
    full_name?: string | null
    role?: string | null
  } | null
  unreadNotifications?: number
}

const MENU_ITEMS: MenuItemDef[] = [
  { href: '/pages/expert/clients',      label: 'Licenses',     icon: Users,      title: 'Licenses' },
  { href: '/pages/expert/agencies',     label: 'Agency',       icon: Building2,  title: 'Agencies' },
  { href: '/pages/expert/applications', label: 'Applications', icon: FileText,   title: 'Applications' },
]

export default function ExpertDashboardLayout({
  children,
  user,
  profile,
  unreadNotifications = 0,
}: ExpertDashboardLayoutProps) {
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
        user={user ?? {}}
        profile={profile}
        unreadNotifications={unreadNotifications}
        mobileMenuOpen={mobileOpen}
        onMobileMenuToggle={() => setMobileOpen(v => !v)}
        profileUrl="/pages/expert/profile"
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
          className={`flex-1 p-4 sm:p-6 w-full transition-all duration-300 text-slate-900 min-w-0 ${
            collapsed ? 'lg:ml-16' : 'lg:ml-64'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
