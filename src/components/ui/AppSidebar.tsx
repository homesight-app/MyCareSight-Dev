'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronRight, Lock, LogOut, type LucideIcon } from 'lucide-react'
import { signOut } from '@/app/actions/auth'

export interface MenuItemDef {
  href: string
  label: string
  icon: LucideIcon
  badge?: number
  title?: string
  subtitle?: string
  locked?: boolean
}

export interface MenuGroupDef {
  id: string
  label: string
  icon: LucideIcon
  items: MenuItemDef[]
}

interface AppSidebarProps {
  menuItems: MenuItemDef[]
  menuGroups?: MenuGroupDef[]
  supportItems?: MenuItemDef[]
  collapsed: boolean
  onCollapse: (v: boolean) => void
  mobileOpen: boolean
  onMobileClose: () => void
  /** Extra content inserted above the logout button (e.g. application progress widget) */
  extraContent?: React.ReactNode
  onLockedItemClick?: (item: MenuItemDef) => void
  /** Retained for a future custom-branding phase; the sidebar currently uses bundled branding. */
  logoSrc?: string
  /** Retained for a future custom-branding phase; the sidebar currently uses bundled branding. */
  logoIconSrc?: string
}

const DEFAULT_LOGO_SRC = '/MyCareSight-Logo Bleu.png'
const DEFAULT_LOGO_ICON_SRC = '/MyCareSight-Icon Bleu.png'

export default function AppSidebar({
  menuItems,
  menuGroups,
  supportItems,
  collapsed,
  onCollapse,
  mobileOpen,
  onMobileClose,
  extraContent,
  onLockedItemClick,
}: AppSidebarProps) {
  const pathname = usePathname()
  const displayedLogoSrc = collapsed ? DEFAULT_LOGO_ICON_SRC : DEFAULT_LOGO_SRC
  const itemIsActive = (item: MenuItemDef) =>
    !item.locked && (
      pathname === item.href ||
      (pathname.startsWith(item.href + '/') &&
        item.href !== '/pages/agency' &&
        item.href !== '/pages/admin' &&
        item.href !== '/pages/caregiver')
    )
  const activeGroupId = menuGroups?.find(group => group.items.some(itemIsActive))?.id ?? null
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(activeGroupId ? [activeGroupId] : [])
  )

  useEffect(() => {
    if (!activeGroupId) return
    setExpandedGroups(previous => {
      if (previous.has(activeGroupId)) return previous
      const next = new Set(previous)
      next.add(activeGroupId)
      return next
    })
  }, [activeGroupId])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(previous => {
      const next = new Set(previous)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const renderMenuItem = (
    item: MenuItemDef,
    options?: { nested?: boolean; groupExpanded?: boolean; groupLocked?: boolean }
  ) => {
    const isActive = itemIsActive(item)
    const Icon = item.icon
    const nested = options?.nested ?? false
    const groupExpanded = options?.groupExpanded ?? true
    const showItemLock = item.locked && !options?.groupLocked
    const className = `
      flex w-full items-center gap-3 rounded-lg text-sm transition-all duration-200
      ${nested && !collapsed ? 'ml-1 px-3 py-2' : 'px-3 py-2.5'}
      ${item.locked
        ? 'border-l-2 border-transparent pl-[10px] text-slate-500 hover:bg-white/5 hover:text-slate-300'
        : isActive
          ? 'border-l-2 border-brand bg-white/10 pl-[10px] font-semibold text-white'
          : 'border-l-2 border-transparent pl-[10px] text-slate-400 hover:bg-white/5 hover:text-slate-200'
      }
    `
    const content = (
      <>
        <div className="relative flex-shrink-0">
          <Icon className={nested ? 'w-4 h-4' : 'w-5 h-5'} strokeWidth={2} />
          {collapsed && !item.locked && item.badge != null && item.badge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-400 text-slate-900 text-[9px] font-bold px-1 py-0 min-w-[14px] text-center leading-tight">
              {item.badge}
            </span>
          )}
          {collapsed && showItemLock && (
            <Lock className="absolute -right-2 -top-2 h-3 w-3 text-slate-500" aria-hidden />
          )}
        </div>
        {!collapsed && (
          <div className="flex items-center justify-between min-w-0 w-full">
            <span className="truncate">{item.label}</span>
            {!item.locked && item.badge != null && item.badge > 0 && (
              <span className="ml-2 rounded-full bg-amber-400/20 text-amber-300 text-xs font-semibold px-2 py-0.5 min-w-[1.25rem] text-center shrink-0">
                {item.badge}
              </span>
            )}
            {showItemLock && <Lock className="ml-2 h-3.5 w-3.5 shrink-0" aria-hidden />}
          </div>
        )}
      </>
    )
    if (item.locked) {
      return (
        <button
          key={item.href}
          type="button"
          onClick={() => {
            onMobileClose()
            onLockedItemClick?.(item)
          }}
          aria-label={`${item.label}, not included in your plan`}
          title={`${item.label} — not included in your plan`}
          data-locked="true"
          tabIndex={groupExpanded ? undefined : -1}
          className={className}
        >
          {content}
        </button>
      )
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onMobileClose}
        aria-current={isActive ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        tabIndex={groupExpanded ? undefined : -1}
        className={className}
      >
        {content}
      </Link>
    )
  }

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
        <div className={`h-[90px] flex-shrink-0 overflow-hidden border-b border-slate-700/50 flex items-center ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
          <div className={`relative transition-all duration-300 ${collapsed ? 'w-10 h-10' : 'w-full h-16'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayedLogoSrc}
              alt="MyCareSight"
              className={`absolute inset-0 h-full w-full object-center ${collapsed ? 'object-contain' : 'object-cover'}`}
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
          {/* {!collapsed && (
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2 px-3">
              Main Menu
            </div>
          )} */}

          {/* Primary nav */}
          <nav className="space-y-0.5 flex-1" aria-label="Primary navigation">
            {menuItems.map(item => renderMenuItem(item))}
            {menuGroups?.map(group => {
              const GroupIcon = group.icon
              const isExpanded = expandedGroups.has(group.id)
              const containsActiveItem = group.id === activeGroupId
              const isLocked = group.items.length > 0 && group.items.every(item => item.locked)
              const regionId = `sidebar-group-${group.id}`
              return (
                <div key={group.id} className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isExpanded}
                    aria-controls={regionId}
                    aria-label={collapsed || isLocked
                      ? `${group.label}${isLocked ? ', not included in your plan' : ''}`
                      : undefined}
                    title={collapsed ? `${group.label}${isLocked ? ' — not included in your plan' : ''}` : undefined}
                    data-locked={isLocked ? 'true' : undefined}
                    className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200 ${
                      isExpanded || containsActiveItem
                        ? 'bg-white/[0.07] text-slate-100'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                  >
                    <GroupIcon className="h-5 w-5 flex-shrink-0 text-slate-400" strokeWidth={2} />
                    {collapsed && isLocked && (
                      <Lock className="absolute right-1 top-1 h-3 w-3 text-slate-500" aria-hidden />
                    )}
                    {!collapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-left font-medium">{group.label}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {isLocked && <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden />}
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4" aria-hidden />
                            : <ChevronRight className="h-4 w-4" aria-hidden />}
                        </span>
                      </>
                    )}
                  </button>
                  <div
                    id={regionId}
                    aria-hidden={!isExpanded}
                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className={collapsed ? 'space-y-0.5 pt-0.5' : 'ml-3 space-y-0.5 border-l border-slate-700/60 pl-2 pt-0.5'}>
                        {group.items.map(item => renderMenuItem(item, {
                          nested: true,
                          groupExpanded: isExpanded,
                          groupLocked: isLocked,
                        }))}
                      </div>
                    </div>
                  </div>
                </div>
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
