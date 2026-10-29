'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import RecordActionsMenu, { type RecordAction } from '@/components/ui/RecordActionsMenu'
import type { VisitDetailsActions } from '@/components/VisitDetailsPanel'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'

type Props = {
  isOpen: boolean
  onClose: () => void
  visit: AllVisitCardDTO | null
  actions?: VisitDetailsActions
  actionsBusy?: boolean
  actionDialogOpen?: boolean
  children: ReactNode
}

/** Centered host for reusable visit details; action dialogs can stack above it. */
export default function VisitDetailsDrawer({ isOpen, onClose, visit, actions, actionsBusy, actionDialogOpen = false, children }: Props) {
  const headingId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const actionDialogOpenRef = useRef(actionDialogOpen)
  const wasActionDialogOpenRef = useRef(false)
  actionDialogOpenRef.current = actionDialogOpen

  useEffect(() => {
    if (isOpen && wasActionDialogOpenRef.current && !actionDialogOpen) {
      document.body.style.overflow = 'hidden'
      panelRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Visit actions"]')?.focus()
    }
    wasActionDialogOpenRef.current = actionDialogOpen
  }, [isOpen, actionDialogOpen])

  useEffect(() => {
    if (!isOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (actionDialogOpenRef.current) return
      if (event.key === 'Escape') {
        // Let the open actions menu consume Escape before closing Visit Details.
        if (document.querySelector('[role="menu"]')) return
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null
  const menuActions: RecordAction[] = actions && visit ? [
    { label: visit.caregiverId ? 'Reassign Caregiver' : 'Assign Caregiver', onClick: actions.onAssign, hidden: !actions.onAssign },
    { label: 'Advertise Shift', onClick: actions.onAdvertise, hidden: !actions.onAdvertise },
    { label: 'Unassign', onClick: actions.onUnassign, hidden: !actions.onUnassign },
    { label: visit.status === 'on_hold' ? 'Resume Visit' : 'Reinstate Visit', onClick: actions.onReinstate, hidden: !actions.onReinstate },
    { label: 'Place On Hold', onClick: actions.onHold, hidden: !actions.onHold },
    { label: 'Mark as Missed', onClick: actions.onMiss, hidden: !actions.onMiss },
    { label: 'Correct Visit', onClick: actions.onCorrect, hidden: !actions.onCorrect },
    { label: 'Cancel Visit', onClick: actions.onCancel, hidden: !actions.onCancel, destructive: true },
  ] : []

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
    <section ref={panelRef} role="dialog" aria-modal={!actionDialogOpen} aria-hidden={actionDialogOpen || undefined} aria-labelledby={headingId}
      className="flex max-h-[min(85vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
        <h2 id={headingId} className="text-base font-semibold text-gray-950">Visit Details</h2>
        <div className="flex items-center gap-1">
          {!actionsBusy && menuActions.some(action => !action.hidden) ? <div className="[&>button]:h-10 [&>button]:w-10"><RecordActionsMenu actions={menuActions} label="Visit actions" /></div> : null}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close visit details"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      <div className="flex shrink-0 justify-end border-t border-gray-100 px-5 py-3">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-600">Close</button>
      </div>
    </section>
  </div>
}
