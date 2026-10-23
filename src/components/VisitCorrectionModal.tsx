'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'
import {
  completeVisitCorrectionSchema,
  missedVisitCorrectionSchema,
  type CompleteVisitCorrectionInput,
  type MissedVisitCorrectionInput,
  type VisitCorrectionInput,
} from '@/lib/schemas/visit-correction'

type Props = {
  visit: AllVisitCardDTO
  caregivers: Array<{ id: string; name: string }>
  onClose: () => void
  onSubmit: (input: VisitCorrectionInput) => Promise<{ ok?: true; error?: string }>
}

function toIso(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function CompleteCorrection({ visit, caregivers, onClose, onSubmit }: Props) {
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<CompleteVisitCorrectionInput>({
    resolver: zodResolver(completeVisitCorrectionSchema),
    mode: 'onBlur',
    defaultValues: {
      scheduledVisitId: visit.id,
      expectedStatus: 'missed',
      correctedStatus: 'completed',
      caregiverMemberId: visit.caregiverId ?? '',
      actualStartAt: '',
      actualEndAt: '',
      billableHours: 0,
      reason: '',
    },
  })

  const submit = handleSubmit(async input => {
    setSaving(true)
    try {
      const result = await onSubmit(input)
      if (result.error) toast.error(result.error)
      else onClose()
    } catch {
      toast.error('Unable to correct the visit. Please try again.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-gray-700">This records a manually verified completion. It does not create a caregiver EVV clock event or approve billing.</p>
      <div>
        <label htmlFor="correction-caregiver" className="block text-sm font-medium text-gray-700">Caregiver <span className="text-red-600">*</span></label>
        <select id="correction-caregiver" {...register('caregiverMemberId')} aria-invalid={!!errors.caregiverMemberId}
          aria-describedby={errors.caregiverMemberId ? 'correction-caregiver-error' : undefined}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Select caregiver</option>
          {caregivers.map(caregiver => <option key={caregiver.id} value={caregiver.id}>{caregiver.name}</option>)}
        </select>
        {errors.caregiverMemberId && <p id="correction-caregiver-error" className="mt-1 text-sm text-red-700">Select a caregiver.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="correction-start" className="block text-sm font-medium text-gray-700">Actual start <span className="text-red-600">*</span></label>
          <input id="correction-start" type="datetime-local" {...register('actualStartAt', { setValueAs: toIso })}
            aria-invalid={!!errors.actualStartAt} aria-describedby={errors.actualStartAt ? 'correction-start-error' : undefined}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.actualStartAt && <p id="correction-start-error" className="mt-1 text-sm text-red-700">Enter the actual start date and time.</p>}
        </div>
        <div>
          <label htmlFor="correction-end" className="block text-sm font-medium text-gray-700">Actual end <span className="text-red-600">*</span></label>
          <input id="correction-end" type="datetime-local" {...register('actualEndAt', { setValueAs: toIso })}
            aria-invalid={!!errors.actualEndAt} aria-describedby={errors.actualEndAt ? 'correction-end-error' : undefined}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.actualEndAt && <p id="correction-end-error" className="mt-1 text-sm text-red-700">{errors.actualEndAt.message}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="correction-billable" className="block text-sm font-medium text-gray-700">Proposed billable hours <span className="text-red-600">*</span></label>
        <input id="correction-billable" type="number" min="0" max="744" step="0.01" {...register('billableHours', { valueAsNumber: true })}
          aria-invalid={!!errors.billableHours} aria-describedby={errors.billableHours ? 'correction-billable-error' : undefined}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        {errors.billableHours && <p id="correction-billable-error" className="mt-1 text-sm text-red-700">{errors.billableHours.message}</p>}
      </div>
      <div>
        <label htmlFor="correction-reason" className="block text-sm font-medium text-gray-700">Reason and verification source <span className="text-red-600">*</span></label>
        <textarea id="correction-reason" rows={3} {...register('reason')} aria-invalid={!!errors.reason}
          aria-describedby={errors.reason ? 'correction-reason-error' : undefined}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        {errors.reason && <p id="correction-reason-error" className="mt-1 text-sm text-red-700">{errors.reason.message}</p>}
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" {...register('careVerified')} className="mt-1" />
          <span>I verified that this care occurred and the actual times above are accurate.</span>
        </label>
        {errors.careVerified && <p className="mt-1 text-sm text-red-700">Confirm that care actually occurred.</p>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Save correction</Button>
      </div>
    </form>
  )
}

function MissedCorrection({ visit, onClose, onSubmit }: Props) {
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<MissedVisitCorrectionInput>({
    resolver: zodResolver(missedVisitCorrectionSchema),
    mode: 'onBlur',
    defaultValues: {
      scheduledVisitId: visit.id,
      expectedStatus: 'completed',
      correctedStatus: 'missed',
      reason: '',
    },
  })
  const submit = handleSubmit(async input => {
    setSaving(true)
    try {
      const result = await onSubmit(input)
      if (result.error) toast.error(result.error)
      else onClose()
    } catch {
      toast.error('Unable to correct the visit. Please try again.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-gray-700">This marks the visit missed and voids pending billing. Existing caregiver clock evidence remains in the history. Approved billing must be voided separately first.</p>
      <div>
        <label htmlFor="correction-missed-reason" className="block text-sm font-medium text-gray-700">Reason <span className="text-red-600">*</span></label>
        <textarea id="correction-missed-reason" rows={3} {...register('reason')} aria-invalid={!!errors.reason}
          aria-describedby={errors.reason ? 'correction-missed-reason-error' : undefined}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        {errors.reason && <p id="correction-missed-reason-error" className="mt-1 text-sm text-red-700">{errors.reason.message}</p>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Save correction</Button>
      </div>
    </form>
  )
}

export default function VisitCorrectionModal(props: Props) {
  return (
    <Modal isOpen onClose={props.onClose} title="Correct Visit" subtitle={`${props.visit.dateLabel} · ${props.visit.statusLabel}`} size="lg"
      closeOnBackdropClick={false} closeOnEscape={false}>
      {props.visit.status === 'missed'
        ? <CompleteCorrection {...props} />
        : <MissedCorrection {...props} />}
    </Modal>
  )
}
