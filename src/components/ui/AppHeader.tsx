'use client'

import { Menu, X } from 'lucide-react'
import UserDropdown from '@/components/UserDropdown'
import NotificationDropdown from '@/components/NotificationDropdown'

interface AppHeaderProps {
  user: {
    id?: string
    email?: string | null
  }
  profile: {
    full_name?: string | null
    role?: string | null
  } | null
  mobileMenuOpen: boolean
  onMobileMenuToggle: () => void
  profileUrl: string
  changePasswordUrl: string
  pageTitle?: string
  pageSubtitle?: string
  sidebarCollapsed?: boolean
}

export default function AppHeader({
  user,
  profile,
  mobileMenuOpen,
  onMobileMenuToggle,
  profileUrl,
  changePasswordUrl,
  pageTitle,
  pageSubtitle,
  sidebarCollapsed,
}: AppHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 shadow-sm h-[90px]">
      <div className="flex items-center h-full">

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 ml-4 hover:bg-slate-100 rounded-lg transition-colors text-slate-700 flex-shrink-0"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <X className="w-6 h-6" strokeWidth={2} />
          ) : (
            <Menu className="w-6 h-6" strokeWidth={2} />
          )}
        </button>

        {/* Page title — desktop only, left-aligned just after the sidebar */}
        {pageTitle && (
          <div className={`hidden lg:flex flex-col justify-center pl-5 flex-shrink-0 ${
            sidebarCollapsed ? 'ml-16' : 'ml-64'
          }`}>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{pageTitle}</h1>
            {pageSubtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{pageSubtitle}</p>
            )}
          </div>
        )}

        {/* Center spacer — future search bar goes here */}
        <div className="flex-1" />

        {/* Right controls */}
        <div className="flex items-center gap-2 sm:gap-4 pr-4 sm:pr-6">
          {user?.id && (
            <NotificationDropdown
              userId={user.id}
            />
          )}
          {user && (
            <UserDropdown
              user={user}
              profile={profile}
              profileUrl={profileUrl}
              changePasswordUrl={changePasswordUrl}
            />
          )}
        </div>

      </div>
    </header>
  )
}
