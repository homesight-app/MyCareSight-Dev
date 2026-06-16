'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Home, Award, CalendarDays, Calendar } from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'
import AppHeader from './ui/AppHeader'
import AppSidebar from './ui/AppSidebar'

interface StaffLayoutProps {
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

const MENU_ITEMS = [
  { href: '/pages/caregiver',                  label: 'Dashboard',               icon: Home },
  { href: '/pages/caregiver/my-care-visits',   label: 'My Care Visits',          icon: CalendarDays },
  { href: '/pages/caregiver/my-calendar',      label: 'My Calendar',             icon: Calendar },
  { href: '/pages/caregiver/my-certifications', label: 'My Skills & Certifications', icon: Award },
]

export default function StaffLayout({
  children,
  user,
  profile,
  unreadNotifications = 0,
}: StaffLayoutProps) {
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
        user={user ?? {}}
        profile={profile}
        unreadNotifications={unreadNotifications}
        mobileMenuOpen={mobileOpen}
        onMobileMenuToggle={() => setMobileOpen(v => !v)}
        profileUrl="/pages/caregiver/profile"
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
          className={`flex-1 w-full p-4 sm:p-6 transition-all duration-300 text-slate-900 min-w-0 ${
            collapsed ? 'lg:ml-16' : 'lg:ml-64'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
