'use client'

import { useState, useEffect, useTransition } from 'react'
import { updateLead, updateLeadStage } from '@/app/actions/leads'
import Button from '@/components/ui/PrimaryButton'

interface Props {
  lead: { id: string; retainer_amount: number | null; price: number | null }
  open: boolean
  onClose: () => void
  onSuccess: (stage: 'signed' | 'retainer') => void
}

export default function LeadSignedModal({ lead, open, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [signedDate, setSignedDate] = useState('')
  const [price, setPrice] = useState('')
  const [retainerAmount, setRetainerAmount] = useState('')
  const [retainerCollected, setRetainerCollected] = useState(false)
  const [retainerPaidDate, setRetainerPaidDate] = useState('')

  useEffect(() => {
    if (open) {
      setSignedDate(new Date().toISOString().slice(0, 10))
      setPrice(lead.price != null ? String(lead.price) : '')
      setRetainerAmount(lead.retainer_amount != null ? String(lead.retainer_amount) : '')
      setRetainerCollected(false)
      setRetainerPaidDate(new Date().toISOString().slice(0, 10))
    }
  }, [open, lead.price, lead.retainer_amount])

  if (!open) return null

  const needsPrice = lead.price == null
  const needsRetainer = lead.retainer_amount == null
  const canConfirm =
    !!signedDate &&
    (!needsPrice || !!price) &&
    (!needsRetainer || !!retainerAmount) &&
    !isPending

  const handleConfirm = () => {
    startTransition(async () => {
      await updateLead(lead.id, {
        signedDate: signedDate || undefined,
        price: needsPrice && price ? parseFloat(price) : undefined,
        retainerAmount: needsRetainer && retainerAmount ? parseFloat(retainerAmount) : undefined,
        retainerPaidDate: retainerCollected && retainerPaidDate ? retainerPaidDate : undefined,
      })
      const resultStage = retainerCollected ? 'signed' : 'retainer'
      await updateLeadStage(lead.id, resultStage)
      onSuccess(resultStage)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Mark as Signed</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Signed Date</label>
            <input
              type="date"
              value={signedDate}
              onChange={e => setSignedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {needsPrice && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contract Price <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          {needsRetainer && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Retainer Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={retainerAmount}
                onChange={e => setRetainerAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Retainer already collected?</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="retainerCollected"
                  checked={retainerCollected}
                  onChange={() => setRetainerCollected(true)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="retainerCollected"
                  checked={!retainerCollected}
                  onChange={() => setRetainerCollected(false)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">No</span>
              </label>
            </div>
          </div>

          {retainerCollected && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retainer Collected Date</label>
              <input
                type="date"
                value={retainerPaidDate}
                onChange={e => setRetainerPaidDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isPending} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            loading={isPending}
            className="flex-1"
          >
            {isPending ? 'Saving…' : retainerCollected ? 'Mark Signed - Complete' : 'Move to Retainer Pending'}
          </Button>
        </div>
      </div>
    </div>
  )
}
