'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Pencil, X } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'

type Props = {
  isOpen: boolean
  onClose: () => void
  visit: AllVisitCardDTO | null
  mode?: 'view' | 'edit'
  canEdit?: boolean
  onEdit?: () => void
  onDiscardEdit?: () => void
  onCancelVisit?: () => void
  canCancelVisit?: boolean
  onAdvertiseVisit?: () => void
  canAdvertiseVisit?: boolean
  editFormId?: string
  saving?: boolean
  actionDialogOpen?: boolean
  children: ReactNode
}

/** Centered host for reusable visit details; action dialogs can stack above it. */
export default function VisitDetailsDrawer({
  isOpen, onClose, mode = 'view', canEdit = false, onEdit, onDiscardEdit,
  onCancelVisit, canCancelVisit = false, editFormId, saving = false,
  onAdvertiseVisit, canAdvertiseVisit = false,
  actionDialogOpen = false, children,
}: Props) {
  const headingId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const actionDialogOpenRef = useRef(actionDialogOpen)
  const wasActionDialogOpenRef = useRef(false)
  actionDialogOpenRef.current = actionDialogOpen

  useEffect(() => {
    if (isOpen && wasActionDialogOpenRef.current && !actionDialogOpen) {
      document.body.style.overflow = 'hidden'
      panelRef.current?.querySelector<HTMLButtonElement>('[data-visit-primary-action]')?.focus()
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

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
    <section ref={panelRef} role="dialog" aria-modal={!actionDialogOpen} aria-hidden={actionDialogOpen || undefined} aria-labelledby={headingId}
      className="flex max-h-[min(85vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
        <h2 id={headingId} className="text-base font-semibold text-gray-950">{mode === 'edit' ? 'Edit Visit' : 'Visit Details'}</h2>
        <div className="flex items-center gap-1">
          {mode === 'view' && canEdit && onEdit ? <Button type="button" variant="secondary" size="sm" icon={Pencil} onClick={onEdit} data-visit-primary-action>
            Edit Visit
          </Button> : null}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close visit details"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      <div className={`flex shrink-0 border-t border-gray-100 px-5 py-3 ${mode === 'view' && (canCancelVisit || canAdvertiseVisit) ? 'justify-between' : 'justify-end'} gap-2`}>
        {mode === 'view' ? <div className="flex gap-2">
          {canAdvertiseVisit && onAdvertiseVisit ? <Button type="button" variant="secondary" size="sm" onClick={onAdvertiseVisit}>Advertise Shift</Button> : null}
          {canCancelVisit && onCancelVisit ? <Button type="button" variant="danger" size="sm" onClick={onCancelVisit}>Cancel Visit</Button> : null}
        </div> : null}
        {mode === 'edit' ? <>
          <Button type="button" variant="secondary" onClick={onDiscardEdit} disabled={saving}>Discard changes</Button>
          <Button type="submit" form={editFormId} loading={saving} data-visit-primary-action>Save changes</Button>
        </> : <Button type="button" variant="secondary" onClick={onClose}>Close</Button>}
      </div>
    </section>
  </div>
}
