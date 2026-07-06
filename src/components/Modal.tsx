'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: ReactNode
  /** Shown under the title in muted text (e.g. visit modals). */
  subtitle?: string
  /** Rendered below the subtitle — e.g. pill tab switcher in the sticky header. */
  headerAccessory?: ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  /** e.g. z-[100] when stacking a second modal above another. */
  overlayClassName?: string
  /** Set false for a stacked inner modal so the outer modal keeps body scroll locked. */
  lockBodyScroll?: boolean
  /** Set false so only the top stacked modal reacts to Escape. */
  closeOnEscape?: boolean
  /** Set false to prevent closing when clicking backdrop. */
  closeOnBackdropClick?: boolean
}

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  headerAccessory,
  children,
  size = 'md',
  overlayClassName,
  lockBodyScroll = true,
  closeOnEscape = true,
  closeOnBackdropClick = true,
}: ModalProps) {
  useEffect(() => {
    if (!lockBodyScroll) return
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, lockBodyScroll])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (isOpen && closeOnEscape) {
      window.addEventListener('keydown', handleEscape)
    }
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose, closeOnEscape])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    '3xl': 'max-w-7xl',
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm ${overlayClassName ?? 'z-50'}`}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        className={`bg-white rounded-xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto overflow-x-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 rounded-t-xl">
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                {subtitle ? <p className="text-sm text-gray-500 mt-1">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 -mr-1 -mt-0.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0 text-gray-400 hover:text-gray-600"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 stroke-[1.25]" />
              </button>
            </div>
            {headerAccessory ? <div className="mt-4">{headerAccessory}</div> : null}
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

