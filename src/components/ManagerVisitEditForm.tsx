'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  managerVisitEditSchema,
  supportedVisitTimezones,
  type ManagerVisitEditInput,
  type ManagerVisitEditSnapshot,
} from '@/lib/schemas/manager-visit-edit'

type Props = {
  formId: string
  snapshot: ManagerVisitEditSnapshot
  onSubmit: (input: ManagerVisitEditInput) => Promise<{
    success: boolean
    error?: string
    fieldErrors?: Record<string, string[]>
  }>
  onSavingChange?: (saving: boolean) => void
  onSaved: () => void
}

const timezoneLabels: Record<(typeof supportedVisitTimezones)[number], string> = {
  'America/New_York': 'Eastern Time',
  'America/Chicago': 'Central Time',
  'America/Denver': 'Mountain Time',
  'America/Phoenix': 'Arizona Time',
  'America/Los_Angeles': 'Pacific Time',
  'America/Anchorage': 'Alaska Time',
  'Pacific/Honolulu': 'Hawaii Time',
}

function toLocalInput(value: string | null, timeZone: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (!timeZone) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1 text-xs text-red-700">{message}</p> : null
}

export default function ManagerVisitEditForm({
  formId, snapshot, onSubmit, onSavingChange, onSaved,
}: Props) {
  const { register, handleSubmit, setError, setValue, watch, formState: { errors, isSubmitting } } = useForm<ManagerVisitEditInput>({
    resolver: zodResolver(managerVisitEditSchema),
    mode: 'onBlur',
    defaultValues: {
      scheduledVisitId: snapshot.scheduledVisitId,
      expectedUpdatedAt: snapshot.updatedAt,
      visitDate: snapshot.visitDate,
      scheduledEndDate: snapshot.scheduledEndDate,
      scheduledStartTime: snapshot.scheduledStartTime,
      scheduledEndTime: snapshot.scheduledEndTime,
      caregiverMemberId: snapshot.caregiverMemberId ?? '',
      status: snapshot.status,
      visitTimezone: snapshot.visitTimezone ?? '',
      actualStartAt: toLocalInput(snapshot.actualStartAt, snapshot.visitTimezone),
      actualEndAt: toLocalInput(snapshot.actualEndAt, snapshot.visitTimezone),
      billableHours: snapshot.billableHours,
      changeNote: '',
      careVerified: false,
    },
  })
  const actualStart = watch('actualStartAt')
  const actualEnd = watch('actualEndAt')
  const status = watch('status')
  const visitTimezone = watch('visitTimezone')

  useEffect(() => onSavingChange?.(isSubmitting), [isSubmitting, onSavingChange])

  const submit = handleSubmit(async values => {
    const result = await onSubmit(values)
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof ManagerVisitEditInput, { message: messages[0] })
      }
    }
    if (!result.success) {
      toast.error(result.error ?? 'Unable to update the visit.')
      return
    }
    toast.success('Visit updated')
    onSaved()
  })

  const setStatus = (next: ManagerVisitEditInput['status']) => {
    setValue('status', next, { shouldDirty: true, shouldValidate: true })
    if (next === 'scheduled' || next === 'missed' || next === 'on_hold') {
      setValue('actualStartAt', '', { shouldDirty: true })
      setValue('actualEndAt', '', { shouldDirty: true })
      setValue('careVerified', false, { shouldDirty: true })
    }
  }

  const recordNow = (field: 'actualStartAt' | 'actualEndAt') => {
    if (!visitTimezone) {
      setError('visitTimezone', { message: 'Select the visit location time zone first.' })
      return
    }
    const now = toLocalInput(new Date().toISOString(), visitTimezone)
    setValue(field, now, { shouldDirty: true, shouldValidate: true })
    if (field === 'actualStartAt' && !actualEnd) setValue('status', 'in_progress', { shouldDirty: true })
    if (field === 'actualEndAt') setValue('status', 'completed', { shouldDirty: true })
  }

  useEffect(() => {
    if (actualStart && actualEnd && status !== 'completed') {
      setValue('status', 'completed', { shouldDirty: true, shouldValidate: true })
    } else if (actualStart && !actualEnd && status !== 'in_progress') {
      setValue('status', 'in_progress', { shouldDirty: true, shouldValidate: true })
    }
  }, [actualEnd, actualStart, setValue, status])

  return <form id={formId} onSubmit={submit} noValidate className="space-y-5">
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
      This edits only this visit occurrence. Recurring-series changes remain in the client Schedule.
    </div>

    {snapshot.financialStatus === 'approved' ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      This visit has approved Time &amp; Billing. Void that approval before changing the visit.
    </div> : null}

    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-gray-900">Scheduled visit</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="visit-edit-date" className="text-sm font-medium text-gray-700">Start date <span className="text-red-600">*</span></label>
          <input id="visit-edit-date" type="date" {...register('visitDate')} aria-invalid={!!errors.visitDate}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <FieldError id="visit-edit-date-error" message={errors.visitDate?.message} />
        </div>
        <div>
          <label htmlFor="visit-edit-end-date" className="text-sm font-medium text-gray-700">End date <span className="text-red-600">*</span></label>
          <input id="visit-edit-end-date" type="date" {...register('scheduledEndDate')} aria-invalid={!!errors.scheduledEndDate}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <FieldError id="visit-edit-end-date-error" message={errors.scheduledEndDate?.message} />
        </div>
        <div>
          <label htmlFor="visit-edit-start-time" className="text-sm font-medium text-gray-700">Start time <span className="text-red-600">*</span></label>
          <input id="visit-edit-start-time" type="time" {...register('scheduledStartTime')} aria-invalid={!!errors.scheduledStartTime}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <FieldError id="visit-edit-start-time-error" message={errors.scheduledStartTime?.message} />
        </div>
        <div>
          <label htmlFor="visit-edit-end-time" className="text-sm font-medium text-gray-700">End time <span className="text-red-600">*</span></label>
          <input id="visit-edit-end-time" type="time" {...register('scheduledEndTime')} aria-invalid={!!errors.scheduledEndTime}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <FieldError id="visit-edit-end-time-error" message={errors.scheduledEndTime?.message} />
        </div>
      </div>
      <div>
        <label htmlFor="visit-edit-caregiver" className="text-sm font-medium text-gray-700">Caregiver</label>
        <select id="visit-edit-caregiver" {...register('caregiverMemberId')} aria-invalid={!!errors.caregiverMemberId}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Unassigned</option>
          {snapshot.caregivers.map(caregiver => <option key={caregiver.id} value={caregiver.id}>{caregiver.name}</option>)}
        </select>
        <FieldError id="visit-edit-caregiver-error" message={errors.caregiverMemberId?.message} />
      </div>
      <div>
        <label htmlFor="visit-edit-status" className="text-sm font-medium text-gray-700">Status <span className="text-red-600">*</span></label>
        <select id="visit-edit-status" value={status} onChange={event => setStatus(event.target.value as ManagerVisitEditInput['status'])}
          aria-invalid={!!errors.status} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="on_hold">On hold</option>
        </select>
        <FieldError id="visit-edit-status-error" message={errors.status?.message} />
      </div>
    </fieldset>

    <fieldset className="space-y-3 border-t border-gray-200 pt-4">
      <legend className="text-sm font-semibold text-gray-900">Recorded time</legend>
      <p className="text-xs text-gray-600">
        Source: {snapshot.timeSource === 'caregiver' ? 'Caregiver clock record' : snapshot.timeSource === 'manager_adjusted' ? 'Manager adjustment of caregiver record' : snapshot.timeSource === 'manager_entered' ? 'Manager-entered record' : 'No time recorded'}.
        Caregiver clock evidence is preserved; manager changes are stored separately.
      </p>
      <div>
        <label htmlFor="visit-edit-timezone" className="text-sm font-medium text-gray-700">Visit location time zone <span className="text-red-600">*</span></label>
        <select id="visit-edit-timezone" {...register('visitTimezone')} aria-invalid={!!errors.visitTimezone}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Select time zone</option>
          {supportedVisitTimezones.map(timezone => <option key={timezone} value={timezone}>{timezoneLabels[timezone]}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-500">Use the time zone where the visit occurs, not the scheduler&apos;s device time zone.</p>
        <FieldError id="visit-edit-timezone-error" message={errors.visitTimezone?.message} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="visit-edit-actual-start" className="text-sm font-medium text-gray-700">Actual start</label>
            <button type="button" onClick={() => recordNow('actualStartAt')} className="text-xs font-medium text-blue-700 hover:underline">Use current time</button>
          </div>
          <input id="visit-edit-actual-start" type="datetime-local" {...register('actualStartAt')}
            aria-invalid={!!errors.actualStartAt} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <FieldError id="visit-edit-actual-start-error" message={errors.actualStartAt?.message} />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="visit-edit-actual-end" className="text-sm font-medium text-gray-700">Actual end</label>
            <button type="button" onClick={() => recordNow('actualEndAt')} className="text-xs font-medium text-blue-700 hover:underline">Use current time</button>
          </div>
          <input id="visit-edit-actual-end" type="datetime-local" {...register('actualEndAt')}
            aria-invalid={!!errors.actualEndAt} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <FieldError id="visit-edit-actual-end-error" message={errors.actualEndAt?.message} />
        </div>
      </div>
      <div>
        <label htmlFor="visit-edit-billable" className="text-sm font-medium text-gray-700">Proposed billable hours</label>
        <input id="visit-edit-billable" type="number" min="0" max="744" step="0.01"
          {...register('billableHours', { valueAsNumber: true })} aria-invalid={!!errors.billableHours}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <FieldError id="visit-edit-billable-error" message={errors.billableHours?.message} />
      </div>
      {(actualStart || actualEnd) ? <div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" {...register('careVerified')} className="mt-1" />
          <span>I verified that care occurred and the manager-entered or adjusted times are accurate.</span>
        </label>
        <FieldError id="visit-edit-verified-error" message={errors.careVerified?.message} />
      </div> : null}
    </fieldset>

    <div className="border-t border-gray-200 pt-4">
      <label htmlFor="visit-edit-note" className="text-sm font-medium text-gray-700">Change note <span className="text-red-600">*</span></label>
      <textarea id="visit-edit-note" rows={3} {...register('changeNote')} aria-invalid={!!errors.changeNote}
        aria-describedby="visit-edit-note-help" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <p id="visit-edit-note-help" className="mt-1 text-xs text-gray-500">Saved to Visit Notes and the immutable visit history.</p>
      <FieldError id="visit-edit-note-error" message={errors.changeNote?.message} />
    </div>
  </form>
}
