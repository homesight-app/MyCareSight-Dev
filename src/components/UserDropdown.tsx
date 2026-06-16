'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Key, ChevronDown } from 'lucide-react'
import ChangePasswordModal from './ChangePasswordModal'

interface UserDropdownProps {
  user: {
    email?: string | null
  }
  profile: {
    full_name?: string | null
    role?: string | null
  } | null
  profileUrl: string
  changePasswordUrl: string
}

export default function UserDropdown({ 
  user, 
  profile, 
  profileUrl,
  changePasswordUrl 
}: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close dropdown when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  const getInitials = (name: string | null | undefined, email: string | null | undefined) => {
    if (name) {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return 'U'
  }

  const getDisplayName = () => {
    return profile?.full_name || user.email || 'User'
  }

  const getRoleDisplay = () => {
    if (!profile?.role) return 'User'
    let role = profile.role
    if (role === 'company_owner') {
      role = 'Agency Admin'
    }
    if (role === 'staff_member') {
      role = 'Caregiver'
    }
    if (role === 'care_coordinator') {
      role = 'Care Coordinator'
    }
    return role;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Info Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:bg-slate-100 px-2 md:px-3 py-2 rounded-lg transition-colors"
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-200 rounded-full flex items-center justify-center font-semibold text-sm sm:text-base text-slate-700">
          {getInitials(profile?.full_name, user.email)}
        </div>
        <div className="hidden md:block text-left">
          <div className="font-semibold text-sm sm:text-base text-slate-900">{getDisplayName()}</div>
          <div className="text-xs sm:text-sm text-slate-500">{getRoleDisplay()}</div>
        </div>
        <ChevronDown className={`w-4 h-4 hidden md:block transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-200">
            <div className="font-semibold text-gray-900">{getDisplayName()}</div>
            <div className="text-sm text-gray-500 mt-1">{user.email || ''}</div>
          </div>
          
          <div className="py-2">
            <Link
              href={profileUrl}
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <User className="w-5 h-5 text-gray-400" />
              <span>View Profile</span>
            </Link>
            
            <button
              onClick={() => {
                setIsOpen(false)
                setIsChangePasswordModalOpen(true)
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <Key className="w-5 h-5 text-gray-400" />
              <span>Change Password</span>
            </button>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
      />
    </div>
  )
}

