'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { MoreVertical } from 'lucide-react'
import Link from 'next/link'

export interface RecordAction {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick?: () => void
  href?: string
  destructive?: boolean
  hidden?: boolean
}

interface RecordActionsMenuProps {
  actions: RecordAction[]
  label: string
}

export default function RecordActionsMenu({ actions, label }: RecordActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRectRef = useRef<DOMRect | null>(null)

  const visible = actions.filter(a => !a.hidden)
  const hasDestructive = visible.some(a => a.destructive)

  const updatePos = () => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    buttonRectRef.current = rect
    const menuWidth = 192 // w-48
    let left = rect.left
    if (left + menuWidth > window.innerWidth - 8) {
      left = rect.right - menuWidth
    }
    setPos({ top: rect.bottom + 4, left })
  }

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return
    const menuH = menuRef.current.offsetHeight
    const btnRect = buttonRectRef.current
    if (!btnRect) return
    if (btnRect.bottom + 4 + menuH > window.innerHeight - 8) {
      setPos(prev => ({ ...prev, top: btnRect.top - menuH - 4 }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) setIsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false) }
    const onScroll = () => { if (isOpen) updatePos() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', updatePos)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [isOpen])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    updatePos()
    setIsOpen(v => !v)
  }

  const handleAction = (e: React.MouseEvent, fn?: () => void) => {
    e.stopPropagation()
    fn?.()
    setIsOpen(false)
  }

  const nonDestructive = visible.filter(a => !a.destructive)
  const destructive = visible.filter(a => a.destructive)

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-label={label}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[9999] w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1"
          style={{ top: pos.top, left: pos.left }}
        >
          {nonDestructive.map((action, i) => {
            const Icon = action.icon
            const content = (
              <>
                {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
                <span className="text-sm font-medium text-gray-700">{action.label}</span>
              </>
            )
            if (action.href) {
              return (
                <Link
                  key={i}
                  href={action.href}
                  role="menuitem"
                  onClick={e => e.stopPropagation()}
                  className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-gray-50 transition-colors"
                >
                  {content}
                </Link>
              )
            }
            return (
              <button
                key={i}
                role="menuitem"
                onClick={e => handleAction(e, action.onClick)}
                className="w-full px-3 py-2.5 text-left flex items-center gap-2.5 hover:bg-gray-50 transition-colors"
              >
                {content}
              </button>
            )
          })}

          {hasDestructive && (
            <>
              <div className="my-1 border-t border-gray-100" />
              {destructive.map((action, i) => {
                const Icon = action.icon
                return (
                  <button
                    key={i}
                    role="menuitem"
                    onClick={e => handleAction(e, action.onClick)}
                    className="w-full px-3 py-2.5 text-left flex items-center gap-2.5 hover:bg-red-50 transition-colors"
                  >
                    {Icon && <Icon className="w-4 h-4 text-red-400 shrink-0" />}
                    <span className="text-sm font-medium text-red-600">{action.label}</span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </>
  )
}
