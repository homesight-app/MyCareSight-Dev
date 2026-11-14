'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm, type FieldValues, type Path, type UseFormRegister, type UseFormSetError } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import { CaregiverAssignmentList } from '@/components/CaregiverAssignmentList'
import { getCaregiverCandidatesForVisitAction } from '@/app/actions/visit-candidates'
import type { CaregiverMatchOption } from '@/lib/caregiver-matching'
import {
  managerVisitScheduleEditSchema,
  managerVisitLocationEditSchema,
  managerVisitCaregiverEditSchema,
  managerVisitStatusEditSchema,
  managerVisitTimeEditSchema,
  supportedVisitTimezones,
  type ManagerVisitEditInput,
  type ManagerVisitEditScope,
  type ManagerVisitEditSnapshot,
  type ManagerVisitScheduleEditInput,
  type ManagerVisitLocationEditInput,
  type ManagerVisitCaregiverEditInput,
  type ManagerVisitStatusEditInput,
  type ManagerVisitTimeEditInput,
} from '@/lib/schemas/manager-visit-edit'

type ActionResult = { success: boolean; error?: string; fieldErrors?: Record<string, string[]> }
type Props = {
  scope: ManagerVisitEditScope | null
  snapshot: ManagerVisitEditSnapshot
  clientId: string
  requiredSkills: string[]
  preferredSkills: string[]
  onClose: () => void
  onSubmit: (input: ManagerVisitEditInput) => Promise<ActionResult>
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
  if (!value || !timeZone) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

function localDateTimeToEpoch(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const wallClockUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(wallClockUtc))
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value)
  const renderedUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
  return wallClockUtc - (renderedUtc - wallClockUtc)
}

function calculatedDurationHours(start: string, end: string, timeZone: string | null) {
  if (!start || !end || !timeZone) return null
  const startMs = localDateTimeToEpoch(start, timeZone)
  const endMs = localDateTimeToEpoch(end, timeZone)
  if (startMs === null || endMs === null || endMs <= startMs) return null
  return Math.round(((endMs - startMs) / 3_600_000) * 100) / 100
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-red-700">{message}</p> : null
}

function NoteField<T extends FieldValues>({ register, error }: {
  register: UseFormRegister<T>
  error?: string
}) {
  return <div>
    <label htmlFor="visit-change-note" className="text-sm font-medium text-gray-700">Change note <span className="text-red-600">*</span></label>
    <textarea id="visit-change-note" rows={3} {...register('changeNote' as Path<T>)} aria-invalid={!!error}
      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    <p className="mt-1 text-xs text-gray-500">Saved to Visit Notes and immutable visit history.</p>
    <FieldError message={error} />
  </div>
}

function applyServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors?: Record<string, string[]>,
) {
  for (const [field, messages] of Object.entries(fieldErrors ?? {})) {
    setError(field as Path<T>, { message: messages[0] })
  }
}

function FormActions({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return <div className="flex justify-end gap-2">
    <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
    <Button type="submit" loading={saving}>Save change</Button>
  </div>
}

function ScheduleForm({ snapshot, onClose, onSubmit, onSaved }: Pick<Props, 'snapshot' | 'onClose' | 'onSubmit' | 'onSaved'>) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ManagerVisitScheduleEditInput>({
    resolver: zodResolver(managerVisitScheduleEditSchema),
    mode: 'onBlur',
    defaultValues: {
      scope: 'schedule', scheduledVisitId: snapshot.scheduledVisitId, expectedUpdatedAt: snapshot.updatedAt,
      visitDate: snapshot.visitDate, scheduledEndDate: snapshot.scheduledEndDate,
      scheduledStartTime: snapshot.scheduledStartTime, scheduledEndTime: snapshot.scheduledEndTime, changeNote: '',
    },
  })
  const submit = handleSubmit(async values => {
    const result = await onSubmit(values)
    applyServerErrors(setError, result.fieldErrors)
    if (!result.success) return toast.error(result.error ?? 'Unable to update the visit schedule.')
    toast.success('Visit schedule updated')
    onSaved()
  })
  return <form onSubmit={submit} noValidate className="space-y-5">
    <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
      This changes only this visit occurrence. Edit the recurring series from the client Schedule.
    </p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label htmlFor="visit-schedule-start-date" className="text-sm font-medium">Start date <span className="text-red-600">*</span></label><input id="visit-schedule-start-date" type="date" {...register('visitDate')} aria-invalid={!!errors.visitDate} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /><FieldError message={errors.visitDate?.message} /></div>
      <div><label htmlFor="visit-schedule-end-date" className="text-sm font-medium">End date <span className="text-red-600">*</span></label><input id="visit-schedule-end-date" type="date" {...register('scheduledEndDate')} aria-invalid={!!errors.scheduledEndDate} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /><FieldError message={errors.scheduledEndDate?.message} /></div>
      <div><label htmlFor="visit-schedule-start-time" className="text-sm font-medium">Start time <span className="text-red-600">*</span></label><input id="visit-schedule-start-time" type="time" {...register('scheduledStartTime')} aria-invalid={!!errors.scheduledStartTime} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /><FieldError message={errors.scheduledStartTime?.message} /></div>
      <div><label htmlFor="visit-schedule-end-time" className="text-sm font-medium">End time <span className="text-red-600">*</span></label><input id="visit-schedule-end-time" type="time" {...register('scheduledEndTime')} aria-invalid={!!errors.scheduledEndTime} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /><FieldError message={errors.scheduledEndTime?.message} /></div>
    </div>
    <NoteField register={register} error={errors.changeNote?.message} />
    <FormActions saving={isSubmitting} onClose={onClose} />
  </form>
}

function LocationForm({ snapshot, onClose, onSubmit, onSaved }: Pick<Props, 'snapshot' | 'onClose' | 'onSubmit' | 'onSaved'>) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ManagerVisitLocationEditInput>({
    resolver: zodResolver(managerVisitLocationEditSchema),
    mode: 'onBlur',
    defaultValues: {
      scope: 'location', scheduledVisitId: snapshot.scheduledVisitId, expectedUpdatedAt: snapshot.updatedAt,
      patientAddressId: snapshot.patientAddressId ?? '', changeNote: '',
    },
  })
  const submit = handleSubmit(async values => {
    const result = await onSubmit(values)
    applyServerErrors(setError, result.fieldErrors)
    if (!result.success) return toast.error(result.error ?? 'Unable to update the visit location.')
    toast.success('Visit location updated')
    onSaved()
  })
  return <form onSubmit={submit} noValidate className="space-y-5">
    <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
      This changes only this visit occurrence. Manage saved client addresses from the client profile.
    </p>
    <div>
      <label htmlFor="visit-location" className="text-sm font-medium">Visit location <span className="text-red-600">*</span></label>
      <select id="visit-location" {...register('patientAddressId')} aria-invalid={!!errors.patientAddressId}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
        <option value="">Select visit location</option>
        {snapshot.visitLocations.map(location => <option key={location.id} value={location.id}>
          {location.label} — {location.displayAddress}
        </option>)}
      </select>
      <p className="mt-1 text-xs text-gray-500">The visit time zone is stored automatically from the selected address.</p>
      <FieldError message={errors.patientAddressId?.message} />
    </div>
    <NoteField register={register} error={errors.changeNote?.message} />
    <FormActions saving={isSubmitting} onClose={onClose} />
  </form>
}

type FinderProps = Pick<Props, 'snapshot' | 'clientId' | 'requiredSkills' | 'preferredSkills'> & {
  selectedId: string
  onSelect: (id: string) => void
}

function CaregiverFinder({ snapshot, clientId, requiredSkills, preferredSkills, selectedId, onSelect }: FinderProps) {
  const [options, setOptions] = useState<CaregiverMatchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    void getCaregiverCandidatesForVisitAction(snapshot.scheduledVisitId).then(result => {
      if (!active) return
      setOptions(result.data ?? [])
      setError(result.error ?? null)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setError('Unable to load caregivers.')
      setLoading(false)
    })
    return () => { active = false }
  }, [snapshot.scheduledVisitId])
  return <div className="space-y-2">
    {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <CaregiverAssignmentList options={options} requiredSkills={requiredSkills} preferredSkills={preferredSkills}
      selectedId={selectedId || undefined} onSelect={onSelect} clientId={clientId}
      isLoading={loading} variant="modal" defaultFilter="eligible" assignmentMode="direct" />
  </div>
}

function CaregiverForm(props: Props) {
  const { snapshot, onClose, onSubmit, onSaved } = props
  const { register, handleSubmit, setError, setValue, watch, formState: { errors, isSubmitting } } = useForm<ManagerVisitCaregiverEditInput>({
    resolver: zodResolver(managerVisitCaregiverEditSchema), mode: 'onBlur',
    defaultValues: { scope: 'caregiver', scheduledVisitId: snapshot.scheduledVisitId, expectedUpdatedAt: snapshot.updatedAt, caregiverMemberId: snapshot.caregiverMemberId ?? '', changeNote: '' },
  })
  const selectedId = watch('caregiverMemberId')
  const submit = handleSubmit(async values => {
    const result = await onSubmit(values)
    applyServerErrors(setError, result.fieldErrors)
    if (!result.success) return toast.error(result.error ?? 'Unable to update the caregiver.')
    toast.success(values.caregiverMemberId ? 'Caregiver assignment updated' : 'Caregiver unassigned')
    onSaved()
  })
  return <form onSubmit={submit} noValidate className="space-y-5">
    <CaregiverFinder {...props} selectedId={selectedId} onSelect={id => setValue('caregiverMemberId', id, { shouldDirty: true, shouldValidate: true })} />
    {snapshot.caregiverMemberId ? <Button type="button" variant="secondary" size="sm" onClick={() => setValue('caregiverMemberId', '', { shouldDirty: true })}>Unassign caregiver</Button> : null}
    <FieldError message={errors.caregiverMemberId?.message} />
    <NoteField register={register} error={errors.changeNote?.message} />
    <FormActions saving={isSubmitting} onClose={onClose} />
  </form>
}

function StatusForm({ snapshot, onClose, onSubmit, onSaved }: Pick<Props, 'snapshot' | 'onClose' | 'onSubmit' | 'onSaved'>) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ManagerVisitStatusEditInput>({
    resolver: zodResolver(managerVisitStatusEditSchema), mode: 'onBlur',
    defaultValues: {
      scope: 'status', scheduledVisitId: snapshot.scheduledVisitId, expectedUpdatedAt: snapshot.updatedAt,
      status: snapshot.status === 'missed' || snapshot.status === 'on_hold' ? snapshot.status : 'scheduled', changeNote: '',
    },
  })
  const submit = handleSubmit(async values => {
    const result = await onSubmit(values)
    applyServerErrors(setError, result.fieldErrors)
    if (!result.success) return toast.error(result.error ?? 'Unable to update the visit status.')
    toast.success('Visit status updated')
    onSaved()
  })
  return <form onSubmit={submit} noValidate className="space-y-5">
    <div>
      <label htmlFor="visit-status" className="text-sm font-medium">Status <span className="text-red-600">*</span></label>
      <select id="visit-status" {...register('status')} aria-invalid={!!errors.status} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
        <option value="scheduled">{snapshot.status === 'on_hold' ? 'Resume as scheduled' : 'Scheduled'}</option>
        <option value="missed">Missed</option>
        <option value="on_hold">On hold</option>
      </select>
      <p className="mt-1 text-xs text-gray-500">To mark a visit in progress or completed, record its actual time.</p>
      <FieldError message={errors.status?.message} />
    </div>
    <NoteField register={register} error={errors.changeNote?.message} />
    <FormActions saving={isSubmitting} onClose={onClose} />
  </form>
}

function TimeForm(props: Props) {
  const { snapshot, onClose, onSubmit, onSaved } = props
  const initialStart = toLocalInput(snapshot.actualStartAt, snapshot.visitTimezone)
    || `${snapshot.visitDate}T${snapshot.scheduledStartTime}`
  const { register, handleSubmit, setError, setValue, watch, formState: { errors, isSubmitting } } = useForm<ManagerVisitTimeEditInput>({
    resolver: zodResolver(managerVisitTimeEditSchema), mode: 'onBlur',
    defaultValues: {
      scope: 'time', scheduledVisitId: snapshot.scheduledVisitId, expectedUpdatedAt: snapshot.updatedAt,
      actualStartAt: initialStart, actualEndAt: toLocalInput(snapshot.actualEndAt, snapshot.visitTimezone),
      careVerified: false, changeNote: '',
    },
  })
  const actualStart = watch('actualStartAt')
  const actualEnd = watch('actualEndAt')
  const calculatedHours = calculatedDurationHours(actualStart, actualEnd, snapshot.visitTimezone)
  const submit = handleSubmit(async values => {
    const result = await onSubmit(values)
    applyServerErrors(setError, result.fieldErrors)
    if (!result.success) return toast.error(result.error ?? 'Unable to update recorded time.')
    toast.success(values.actualEndAt ? 'Completed visit recorded' : 'Visit clock-in recorded')
    onSaved()
  })
  const setCurrentTime = (field: 'actualStartAt' | 'actualEndAt') => {
    if (!snapshot.visitTimezone) return
    setValue(field, toLocalInput(new Date().toISOString(), snapshot.visitTimezone), { shouldDirty: true, shouldValidate: true })
  }
  if (!snapshot.caregiverMemberId) {
    return <div className="space-y-5">
      <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Assign a caregiver from the Caregiver row before recording visit time.
      </p>
      <div className="flex justify-end"><Button type="button" variant="secondary" onClick={onClose}>Close</Button></div>
    </div>
  }
  if (!snapshot.visitTimezone) {
    return <div className="space-y-5">
      <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        This visit has no stored time zone. Use the Location pencil to select a saved address with a valid ZIP code, then reopen Recorded time.
      </p>
      <div className="flex justify-end"><Button type="button" variant="secondary" onClick={onClose}>Close</Button></div>
    </div>
  }
  return <form onSubmit={submit} noValidate className="space-y-5">
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      Manager-entered time requires verification and a note. Original caregiver clock evidence remains unchanged.
    </p>
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Assigned caregiver</div>
      <div className="mt-0.5 text-sm font-medium text-gray-900">{snapshot.caregiverName ?? 'Assigned caregiver'}</div>
      <p className="mt-1 text-xs text-gray-500">Use the Caregiver pencil in Visit Details to change this assignment.</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Visit location time zone</div>
      <div className="mt-0.5 text-sm font-medium text-gray-900">{timezoneLabels[snapshot.visitTimezone]}</div>
      <p className="mt-1 text-xs text-gray-500">Automatically determined from the visit address.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><div className="flex justify-between"><label htmlFor="visit-actual-start" className="text-sm font-medium">Actual start <span className="text-red-600">*</span></label><button type="button" className="text-xs font-medium text-blue-700" onClick={() => setCurrentTime('actualStartAt')}>Use current time</button></div><input id="visit-actual-start" type="datetime-local" {...register('actualStartAt')} aria-invalid={!!errors.actualStartAt} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /><FieldError message={errors.actualStartAt?.message} /></div>
      <div><div className="flex justify-between"><label htmlFor="visit-actual-end" className="text-sm font-medium">Actual end</label><button type="button" className="text-xs font-medium text-blue-700" onClick={() => setCurrentTime('actualEndAt')}>Use current time</button></div><input id="visit-actual-end" type="datetime-local" {...register('actualEndAt')} aria-invalid={!!errors.actualEndAt} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /><FieldError message={errors.actualEndAt?.message} /></div>
    </div>
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Calculated duration and billable time</div>
      <div className="mt-0.5 text-sm font-medium text-gray-900">{calculatedHours === null ? 'Enter an end time to calculate' : `${calculatedHours.toFixed(2)} hours`}</div>
      <p className="mt-1 text-xs text-gray-500">Calculated from the actual start and end times. Adjust the times to correct this value.</p>
    </div>
    <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" {...register('careVerified')} className="mt-1" /><span>I verified that care occurred and these manager-entered or adjusted times are accurate.</span></label>
    <FieldError message={errors.careVerified?.message} />
    <NoteField register={register} error={errors.changeNote?.message} />
    <FormActions saving={isSubmitting} onClose={onClose} />
  </form>
}

const titles: Record<ManagerVisitEditScope, string> = {
  status: 'Edit Visit Status',
  caregiver: 'Assign or Reassign Caregiver',
  schedule: 'Edit Visit Schedule',
  location: 'Edit Visit Location',
  time: 'Record or Edit Visit Time',
}

export default function ManagerVisitScopedEditModal(props: Props) {
  const content = useMemo(() => {
    if (!props.scope) return null
    if (props.scope === 'schedule') return <ScheduleForm {...props} />
    if (props.scope === 'location') return <LocationForm {...props} />
    if (props.scope === 'caregiver') return <CaregiverForm {...props} />
    if (props.scope === 'status') return <StatusForm {...props} />
    return <TimeForm {...props} />
  }, [props])
  return <Modal isOpen={!!props.scope} onClose={props.onClose} title={props.scope ? titles[props.scope] : ''}
    size={props.scope === 'caregiver' || props.scope === 'time' ? 'xl' : 'md'}
    overlayClassName="z-[100]" lockBodyScroll={false} closeOnBackdropClick={false}>
    {content}
  </Modal>
}
