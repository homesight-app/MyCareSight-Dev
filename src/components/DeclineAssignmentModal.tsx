'use client'

import { ThumbsDown } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { useState, useEffect } from 'react'
import Modal from './Modal'

interface DeclineAssignmentModalProps {
  isOpen: boolean
  onClose: () => void
  caregiverName: string
  clientName: string
  onConfirm: (reason: string) => void
  /** Assignment = request to take a visit; unassignment = request to leave an assigned visit. */
  variant?: 'assignment' | 'unassignment'
}

export default function DeclineAssignmentModal({
  isOpen,
  onClose,
  caregiverName,
  clientName,
  onConfirm,
  variant = 'assignment',
}: DeclineAssignmentModalProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!isOpen) setReason('')
  }, [isOpen])

  const titleText =
    variant === 'unassignment' ? 'Decline Unassignment Request' : 'Decline Assignment Request'
  const subtitleText =
    variant === 'unassignment'
      ? `Declining ${caregiverName}'s request to be removed from ${clientName}'s visit.`
      : `Declining ${caregiverName}'s request for ${clientName}'s visit.`
  const helperText =
    variant === 'unassignment'
      ? 'The caregiver will be notified that their unassignment request was not approved.'
      : 'The caregiver will be notified that their request was not selected.'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2 text-red-600">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-50">
            <ThumbsDown className="h-4 w-4" aria-hidden />
          </span>
          {titleText}
        </span>
      }
      subtitle={subtitleText}
      size="md"
    >
      <div className="space-y-4 -mt-2">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Reason <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Schedule conflict, skills mismatch, another caregiver was better suited..."
            className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 placeholder:italic focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
          />
        </div>
        <p className="text-xs text-gray-500">{helperText}</p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" type="button" onClick={() => onConfirm(reason.trim())} icon={ThumbsDown}>
            Confirm Decline
          </Button>
        </div>
      </div>
    </Modal>
  )
}
