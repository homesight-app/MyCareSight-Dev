'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Users,
  LogOut,
  ChevronLeft,
  Menu,
  X,
  Building2
} from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import LoadingSpinner from './LoadingSpinner'
import UserDropdown from './UserDropdown'
import NotificationDropdown from './NotificationDropdown'

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

export default function ExpertDashboardLayout({ 
  children, 
  user, 
  profile,
  unreadNotifications = 0 
}: ExpertDashboardLayoutProps) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentPath, setCurrentPath] = useState(pathname)

  // Track pathname changes to show/hide loading
  useEffect(() => {
    if (pathname !== currentPath) {
      setCurrentPath(pathname)
      setIsLoading(false)
    }
  }, [pathname, currentPath])

  // Handle link clicks to show loading
  const handleLinkClick = (href: string) => {
    if (href !== pathname) {
      setIsLoading(true)
    }
  }

  const menuItems = [
    { href: '/pages/expert/clients', label: 'Licenses', icon: Users },
    { href: '/pages/expert/agencies', label: 'Agency', icon: Building2 },
    // { href: '/pages/expert/messages', label: 'Messages', icon: MessageSquare },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {isLoading && <LoadingSpinner />}
      {/* Top Header */}
      {/* <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg"> */}
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
            {user?.id && (
              <NotificationDropdown 
                userId={user.id} 
                initialUnreadCount={unreadNotifications || 0} 
              />
            )}

            {/* User Dropdown */}
            {user && (
              <UserDropdown 
                user={user} 
                profile={profile} 
                profileUrl="/pages/expert/profile"
                changePasswordUrl="/pages/auth/change-password"
              />
            )}
          </div>
        </div>
      </header>

      <div className="flex relative">
        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          bg-white shadow-lg transition-all duration-300 
          fixed top-[73px] left-0 bottom-0 z-40
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarCollapsed ? 'w-16' : 'w-64'}
          overflow-y-auto
        `}>
          <div className="p-4 h-full flex flex-col">
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
                const isActive = pathname === item.href
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      handleLinkClick(item.href)
                      setMobileMenuOpen(false)
                    }}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
            </nav>

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
          className={`flex-1 p-4 sm:p-6 w-full transition-all duration-300 text-gray-900 ${
            sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

