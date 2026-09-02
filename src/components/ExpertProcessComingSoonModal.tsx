'use client'

import { X } from 'lucide-react'

interface ExpertProcessComingSoonModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ExpertProcessComingSoonModal({
  isOpen,
  onClose
}: ExpertProcessComingSoonModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full border-2 border-blue-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-blue-50">
          <h2 className="text-xl font-semibold text-gray-900">Copy Expert Steps - Coming Soon</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-gray-600">
            Expert Process Steps are currently shared across all license types. The copy functionality will be available when expert steps become license-specific.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
