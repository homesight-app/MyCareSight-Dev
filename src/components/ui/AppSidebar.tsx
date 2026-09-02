'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronLeft, LogOut, type LucideIcon } from 'lucide-react'
import { signOut } from '@/app/actions/auth'

export interface MenuItemDef {
  href: string
  label: string
  icon: LucideIcon
  badge?: number
  title?: string
  subtitle?: string
}

interface AppSidebarProps {
  menuItems: MenuItemDef[]
  supportItems?: MenuItemDef[]
  collapsed: boolean
  onCollapse: (v: boolean) => void
  mobileOpen: boolean
  onMobileClose: () => void
  /** Extra content inserted above the logout button (e.g. application progress widget) */
  extraContent?: React.ReactNode
  logoSrc?: string
  logoIconSrc?: string
}

export default function AppSidebar({
  menuItems,
  supportItems,
  collapsed,
  onCollapse,
  mobileOpen,
  onMobileClose,
  extraContent,
  logoSrc = '/MyCareSight-Logo Bleu.png',
  logoIconSrc = '/MyCareSight-Icon Bleu.png',
}: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          transition-all duration-300
          fixed top-0 left-0 bottom-0 z-50
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed ? 'w-16' : 'w-64'}
          overflow-y-auto overflow-x-hidden
          flex flex-col
        `}
        style={{ backgroundColor: 'var(--sidebar-bg, #0F172A)' }}
      >
        {/* Logo area */}
        <div className={`h-[90px] flex-shrink-0 border-b border-slate-700/50 flex items-center ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
          <div className={`relative transition-all duration-300 ${collapsed ? 'w-10 h-10' : 'w-full h-[148px]'}`}>
            <Image
              src={collapsed ? logoIconSrc : logoSrc}
              alt="MyCareSight"
              fill
              className="object-contain object-center"
              priority
            />
          </div>
        </div>

        <div className="p-3 flex flex-col flex-1">
          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => onCollapse(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors mb-3"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft
              className={`w-5 h-5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>

          {/* Section label */}
          {!collapsed && (
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2 px-3">
              Main Menu
            </div>
          )}

          {/* Primary nav */}
          <nav className="space-y-0.5 flex-1">
            {menuItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (pathname.startsWith(item.href + '/') && item.href !== '/pages/agency' && item.href !== '/pages/admin' && item.href !== '/pages/caregiver')
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm
                    ${isActive
                      ? 'bg-white/10 text-white font-semibold border-l-2 border-brand pl-[10px]'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border-l-2 border-transparent pl-[10px]'
                    }
                  `}
                >
                  <div className="relative flex-shrink-0">
                    <Icon className="w-5 h-5" strokeWidth={2} />
                    {collapsed && item.badge != null && item.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-400 text-slate-900 text-[9px] font-bold px-1 py-0 min-w-[14px] text-center leading-tight">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <div className="flex items-center justify-between min-w-0 w-full">
                      <span className="truncate">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span className="ml-2 rounded-full bg-amber-400/20 text-amber-300 text-xs font-semibold px-2 py-0.5 min-w-[1.25rem] text-center shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Support items */}
          {supportItems && supportItems.length > 0 && (
            <div className="mt-4">
              {!collapsed && (
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2 px-3">
                  Support
                </div>
              )}
              <nav className="space-y-0.5">
                {supportItems.map((item) => {
                  const isActive = pathname === item.href
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onMobileClose}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm
                        ${isActive
                          ? 'bg-white/10 text-white font-semibold border-l-2 border-brand pl-[10px]'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border-l-2 border-transparent pl-[10px]'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  )
                })}
              </nav>
            </div>
          )}

          {/* Extra widget (e.g. license progress) */}
          {extraContent && !collapsed && (
            <div className="mt-4 border-t border-slate-700/50 pt-4">
              {extraContent}
            </div>
          )}

          {/* Logout */}
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5 w-full transition-all text-sm border-l-2 border-transparent pl-[10px]"
              >
                <LogOut className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
                {!collapsed && <span>Logout</span>}
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  )
}
