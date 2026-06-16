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
  unreadNotifications: number
  mobileMenuOpen: boolean
  onMobileMenuToggle: () => void
  profileUrl: string
  changePasswordUrl: string
}

export default function AppHeader({
  user,
  profile,
  unreadNotifications,
  mobileMenuOpen,
  onMobileMenuToggle,
  profileUrl,
  changePasswordUrl,
}: AppHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 shadow-sm h-[90px]">
      <div className="flex items-center justify-between px-4 sm:px-6 h-full">
        {/* Mobile menu toggle (hidden on desktop — sidebar covers the left portion) */}
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-700"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <X className="w-6 h-6" strokeWidth={2} />
          ) : (
            <Menu className="w-6 h-6" strokeWidth={2} />
          )}
        </button>

        {/* Spacer so right-side controls stay right-aligned on desktop */}
        <div className="hidden lg:block" />

        <div className="flex items-center gap-2 sm:gap-4">
          {user?.id && (
            <NotificationDropdown
              userId={user.id}
              initialUnreadCount={unreadNotifications}
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
