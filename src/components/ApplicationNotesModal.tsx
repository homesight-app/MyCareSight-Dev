'use client'

import { X } from 'lucide-react'
import InternalNotesPanel from './InternalNotesPanel'
import type { InternalNoteSubjectType } from '@/lib/supabase/query/internal-notes'

interface ApplicationNotesModalProps {
  isOpen: boolean
  onClose: () => void
  subjectType: Extract<InternalNoteSubjectType, 'application_step' | 'application_document'>
  subjectId: string
  agencyId: string
  applicationId: string
  title: string
}

export default function ApplicationNotesModal({
  isOpen,
  onClose,
  subjectType,
  subjectId,
  agencyId,
  applicationId,
  title,
}: ApplicationNotesModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 truncate pr-4">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notes panel — scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          <InternalNotesPanel
            subjectType={subjectType}
            subjectId={subjectId}
            agencyId={agencyId}
            applicationId={applicationId}
            canManage={true}
          />
        </div>
      </div>
    </div>
  )
}
