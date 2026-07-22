'use client'

import { useState, useEffect, useTransition } from 'react'
import { updateLead, updateLeadStage } from '@/app/actions/leads'

interface Props {
  leadId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function LeadCollectRetainerModal({ leadId, open, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [retainerPaidDate, setRetainerPaidDate] = useState('')

  useEffect(() => {
    if (open) {
      setRetainerPaidDate(new Date().toISOString().slice(0, 10))
    }
  }, [open])

  if (!open) return null

  const handleConfirm = () => {
    startTransition(async () => {
      await updateLead(leadId, { retainerPaidDate })
      await updateLeadStage(leadId, 'signed')
      onSuccess()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Collect Retainer</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Retainer Collected Date</label>
            <input
              type="date"
              value={retainerPaidDate}
              onChange={e => setRetainerPaidDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!retainerPaidDate || isPending}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Mark Retainer Collected'}
          </button>
        </div>
      </div>
    </div>
  )
}
