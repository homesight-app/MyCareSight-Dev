'use client'

import { X, Lock } from 'lucide-react'

interface UpgradePromptModalProps {
  open: boolean
  onClose: () => void
}

export default function UpgradePromptModal({ open, onClose }: UpgradePromptModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 flex flex-col items-center text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-slate-400" strokeWidth={1.5} />
        </div>

        <h2 className="text-lg font-semibold text-slate-900 mb-2">Feature not included</h2>
        <p className="text-sm text-slate-500 mb-6">
          This feature is not part of your current plan. Contact us to learn about upgrading your access.
        </p>

        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Dismiss
          </button>
          <a
            href="mailto:support@mycaresight.com"
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors text-center"
          >
            Contact Us
          </a>
        </div>
      </div>
    </div>
  )
}
