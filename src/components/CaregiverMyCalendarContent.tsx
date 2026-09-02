'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { createClient } from '@/lib/supabase/client'
import type { CaregiverAvailabilitySlotRow } from '@/lib/supabase/query/caregiver-availability'
import {
  insertAvailabilitySlotAction,
  updateAvailabilitySlotAction,
  deleteAvailabilitySlotAction,
} from '@/app/actions/caregiver-availability'

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatHm(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw).trim()
  return s.length >= 5 ? s.slice(0, 5) : s
}

function localHmToUtcTime(hm: string, ymd: string): string {
  const v = hm.trim().slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(v) || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return `${v}:00`
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = v.split(':').map(Number)
  const local = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0)
  const uh = String(local.getUTCHours()).padStart(2, '0')
  const um = String(local.getUTCMinutes()).padStart(2, '0')
  return `${uh}:${um}:00`
}

function utcTimeToLocalHm(raw: string | null | undefined, ymd: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return formatHm(raw)
  const t = String(raw).trim().slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(t)) return formatHm(raw)
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  const utcDate = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0))
  return `${String(utcDate.getHours()).padStart(2, '0')}:${String(utcDate.getMinutes()).padStart(2, '0')}`
}

const DOW_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function slotAppliesOnDate(slot: CaregiverAvailabilitySlotRow, ymd: string): boolean {
  if (!slot.is_recurring) {
    const spec = slot.specific_date ? String(slot.specific_date).slice(0, 10) : ''
    return spec === ymd
  }
  const d = new Date(`${ymd}T12:00:00`)
  const dow = d.getDay()
  const days = slot.days_of_week ?? []
  if (!days.includes(dow)) return false
  const rs = slot.repeat_start ? String(slot.repeat_start).slice(0, 10) : null
  if (rs && ymd < rs) return false
  const re = slot.repeat_end ? String(slot.repeat_end).slice(0, 10) : null
  if (re && ymd > re) return false
  return true
}

function buildCalendarCells(viewMonth: Date): { date: Date; inMonth: boolean }[] {
  const y = viewMonth.getFullYear()
  const m = viewMonth.getMonth()
  const first = new Date(y, m, 1)
  const startPad = first.getDay()
  const gridStart = new Date(y, m, 1 - startPad)
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push({ date: d, inMonth: d.getMonth() === m })
  }
  return cells
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function formatListDateLong(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRepeatSubtitle(slot: CaregiverAvailabilitySlotRow): string {
  const days = [...(slot.days_of_week ?? [])].sort((a, b) => a - b)
  const dayPart = days.map((n) => DOW_SHORT[n] ?? '').filter(Boolean).join(', ')
  const start = slot.repeat_start ? formatListDateLong(String(slot.repeat_start).slice(0, 10)) : ''
  const end = slot.repeat_end ? formatListDateLong(String(slot.repeat_end).slice(0, 10)) : ''
  let s = `Every ${dayPart}`
  if (start) s += ` — from ${start}`
  if (end) s += ` until ${end}`
  return s
}

type FormState = {
  label: string
  isRecurring: boolean
  startTime: string
  endTime: string
  repeatFrequency: 'weekly'
  daysOfWeek: number[]
  repeatStart: string
  repeatEnd: string
  specificDate: string
}

const defaultForm = (): FormState => ({
  label: '',
  isRecurring: true,
  startTime: '08:00',
  endTime: '16:00',
  repeatFrequency: 'weekly',
  daysOfWeek: [1, 2, 3, 4, 5],
  repeatStart: toYmd(new Date()),
  repeatEnd: '',
  specificDate: toYmd(new Date()),
})

function slotToForm(slot: CaregiverAvailabilitySlotRow): FormState {
  const baseDate = slot.is_recurring
    ? (slot.repeat_start ? String(slot.repeat_start).slice(0, 10) : toYmd(new Date()))
    : (slot.specific_date ? String(slot.specific_date).slice(0, 10) : toYmd(new Date()))
  return {
    label: slot.label ?? '',
    isRecurring: slot.is_recurring,
    startTime: utcTimeToLocalHm(slot.start_time, baseDate),
    endTime: utcTimeToLocalHm(slot.end_time, baseDate),
    repeatFrequency: 'weekly',
    daysOfWeek: [...(slot.days_of_week ?? [])].sort((a, b) => a - b),
    repeatStart: slot.repeat_start ? String(slot.repeat_start).slice(0, 10) : toYmd(new Date()),
    repeatEnd: slot.repeat_end ? String(slot.repeat_end).slice(0, 10) : '',
    specificDate: slot.specific_date ? String(slot.specific_date).slice(0, 10) : toYmd(new Date()),
  }
}

type CaregiverMyCalendarContentProps = {
  initialSlots: CaregiverAvailabilitySlotRow[]
  caregiverMemberId: string
}

export default function CaregiverMyCalendarContent({
  initialSlots,
  caregiverMemberId,
}: CaregiverMyCalendarContentProps) {
  const [slots, setSlots] = useState<CaregiverAvailabilitySlotRow[]>(initialSlots)
  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  const [selectedYmd, setSelectedYmd] = useState<string | null>(() => toYmd(new Date()))
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const supabase = createClient()
    const { data, error: e } = await supabase
      .from('caregiver_availability_slots')
      .select('*')
      .eq('caregiver_member_id', caregiverMemberId)
      .order('created_at', { ascending: true })
    if (!e && data) setSlots(data as CaregiverAvailabilitySlotRow[])
  }, [caregiverMemberId])

  const calendarCells = useMemo(() => buildCalendarCells(viewMonth), [viewMonth])

  const slotsForList = useMemo(() => {
    return [...slots].sort((a, b) => {
      if (a.is_recurring !== b.is_recurring) return a.is_recurring ? -1 : 1
      const ad = a.is_recurring ? a.repeat_start ?? '' : a.specific_date ?? ''
      const bd = b.is_recurring ? b.repeat_start ?? '' : b.specific_date ?? ''
      return String(ad).localeCompare(String(bd))
    })
  }, [slots])

  const openAdd = (prefill?: Partial<FormState>) => {
    setError(null)
    const base = defaultForm()
    setForm({
      ...base,
      ...prefill,
      daysOfWeek: prefill?.daysOfWeek ?? base.daysOfWeek,
      repeatStart: prefill?.repeatStart ?? base.repeatStart,
      specificDate: prefill?.specificDate ?? base.specificDate,
    })
    setAddOpen(true)
  }

  const openEdit = (slot: CaregiverAvailabilitySlotRow) => {
    setError(null)
    setEditingId(slot.id)
    setForm(slotToForm(slot))
    setEditOpen(true)
  }

  const closeAdd = () => {
    setAddOpen(false)
  }

  const closeEdit = () => {
    setEditOpen(false)
    setEditingId(null)
  }

  const buildPayload = (): Record<string, unknown> => {
    const isRec = form.isRecurring
    const baseDate = isRec ? form.repeatStart : form.specificDate
    return {
      caregiver_member_id: caregiverMemberId,
      label: form.label.trim() || null,
      is_recurring: isRec,
      start_time: localHmToUtcTime(form.startTime, baseDate),
      end_time: localHmToUtcTime(form.endTime, baseDate),
      repeat_frequency: isRec ? 'weekly' : null,
      days_of_week: isRec ? form.daysOfWeek : null,
      repeat_start: isRec ? form.repeatStart : null,
      repeat_end: isRec && form.repeatEnd.trim() ? form.repeatEnd : null,
      specific_date: !isRec ? form.specificDate : null,
    }
  }

  const validate = (): string | null => {
    const sm = form.startTime
    const em = form.endTime
    if (!sm || !em) return 'Start and end time are required.'
    if (sm >= em) return 'End time must be after start time.'
    if (form.isRecurring) {
      if (form.daysOfWeek.length === 0) return 'Select at least one day of the week.'
      if (!form.repeatStart) return 'Start date is required for recurring availability.'
    } else {
      if (!form.specificDate) return 'Date is required.'
    }
    return null
  }

  const handleSaveAdd = async () => {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setSaving(true)
    setError(null)
    const payload = buildPayload()
    const { error: e } = await insertAvailabilitySlotAction(caregiverMemberId, {
      label: payload.label as string | null,
      is_recurring: payload.is_recurring as boolean,
      start_time: payload.start_time as string,
      end_time: payload.end_time as string,
      repeat_frequency: payload.repeat_frequency as string | null,
      days_of_week: payload.days_of_week as number[] | null,
      repeat_start: payload.repeat_start as string | null,
      repeat_end: payload.repeat_end as string | null,
      specific_date: payload.specific_date as string | null,
    })
    setSaving(false)
    if (e) {
      setError(e)
      return
    }
    closeAdd()
    await refresh()
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setSaving(true)
    setError(null)
    const payload = buildPayload()
    const { error: e } = await updateAvailabilitySlotAction(caregiverMemberId, editingId, {
      label: payload.label as string | null,
      is_recurring: payload.is_recurring as boolean,
      start_time: payload.start_time as string,
      end_time: payload.end_time as string,
      repeat_frequency: payload.repeat_frequency as string | null,
      days_of_week: payload.days_of_week as number[] | null,
      repeat_start: payload.repeat_start as string | null,
      repeat_end: payload.repeat_end as string | null,
      specific_date: payload.specific_date as string | null,
    })
    setSaving(false)
    if (e) {
      setError(e)
      return
    }
    closeEdit()
    await refresh()
  }

  const confirmDelete = (id: string) => {
    setDeletingId(id)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setSaving(true)
    const { error: e } = await deleteAvailabilitySlotAction(caregiverMemberId, deletingId)
    setSaving(false)
    if (e) {
      setError(e)
      setDeleteOpen(false)
      return
    }
    setDeleteOpen(false)
    setDeletingId(null)
    if (editingId === deletingId) closeEdit()
    await refresh()
  }

  const toggleDay = (d: number) => {
    setForm((f) => {
      const set = new Set(f.daysOfWeek)
      if (set.has(d)) set.delete(d)
      else set.add(d)
      return { ...f, daysOfWeek: Array.from(set).sort((a, b) => a - b) }
    })
  }

  const goToday = () => {
    const t = new Date()
    setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1))
    setSelectedYmd(toYmd(t))
  }

  const formModal = (opts: {
    title: string
    subtitle: string
    onClose: () => void
    onSubmit: () => void
    submitLabel: string
    variant: 'add' | 'edit'
    showRemove?: boolean
  }) => (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={opts.onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{opts.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{opts.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={opts.onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label (optional)</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. Weekday Availability"
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <div className="text-sm font-medium text-gray-900">Recurring</div>
              <div className="text-xs text-gray-500">Repeat this slot on a schedule.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.isRecurring}
              onClick={() => setForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form.isRecurring ? 'bg-gray-900' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${
                  form.isRecurring ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          {form.isRecurring ? (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repeat frequency</label>
                <select
                  value="weekly"
                  disabled
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50"
                >
                  <option value="weekly">Weekly (specific days)</option>
                </select>
              </div>
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">Days of the week</span>
                <div className="flex flex-wrap gap-2">
                  {DOW_SHORT.map((label, idx) => {
                    const on = form.daysOfWeek.includes(idx)
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`w-9 h-9 rounded-full text-xs font-medium border transition-colors ${
                          on
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.repeatStart}
                    onChange={(e) => setForm((f) => ({ ...f, repeatStart: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date (optional)</label>
                  <input
                    type="date"
                    value={form.repeatEnd}
                    onChange={(e) => setForm((f) => ({ ...f, repeatEnd: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.specificDate}
                onChange={(e) => setForm((f) => ({ ...f, specificDate: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 p-6 border-t border-gray-100 bg-gray-50/80 rounded-b-xl">
          <div>
            {opts.showRemove && (
              <button
                type="button"
                onClick={() => {
                  if (editingId) {
                    confirmDelete(editingId)
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Remove Slot
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="secondary"
              type="button"
              onClick={opts.onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={opts.onSubmit}
              disabled={saving}
              loading={saving}
              icon={opts.variant === 'add' ? Plus : Pencil}
            >
              {opts.submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 mt-20 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-gray-900">My Calendar</h1>
          <p className="text-sm text-gray-600">
            Set your available time slots so you can be matched with visits.
          </p>
        </div>
        <Button
          variant="primary"
          type="button"
          onClick={() => openAdd()}
          icon={Plus}
        >
          Add Time Slot
        </Button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="w-full min-w-0 lg:w-[70%] lg:shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">{formatMonthYear(viewMonth)}</h2>
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            <Button
              variant="primary"
              type="button"
              onClick={() => openAdd()}
              icon={Plus}
            >
              Add Time Slot
            </Button>
            <button
              type="button"
              onClick={goToday}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
          {DOW_SHORT.map((d) => (
            <div key={d} className="bg-gray-50 py-1.5 text-center text-[11px] font-semibold text-gray-600">
              {d}
            </div>
          ))}
          {calendarCells.map(({ date, inMonth }, i) => {
            const ymd = toYmd(date)
            const daySlots = slots.filter((s) => slotAppliesOnDate(s, ymd))
            const isSelected = selectedYmd === ymd
            return (
              <button
                key={`${i}-${ymd}`}
                type="button"
                onClick={() => {
                  setSelectedYmd(ymd)
                  if (daySlots.length > 0) {
                    openEdit(daySlots[0]!)
                  } else {
                    openAdd({ isRecurring: false, specificDate: ymd })
                  }
                }}
                className={`min-h-[68px] sm:min-h-[72px] p-1 text-left align-top bg-white hover:bg-gray-50/80 transition-colors ${
                  inMonth ? '' : 'opacity-50'
                } ${isSelected ? 'ring-2 ring-inset ring-blue-400 z-10' : ''}`}
              >
                <div className={`text-[11px] font-medium mb-0.5 ${inMonth ? 'text-gray-900' : 'text-gray-400'}`}>
                  {date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {daySlots.map((s) => (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(s)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          openEdit(s)
                        }
                      }}
                      className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80 cursor-pointer"
                    >
                      {s.is_recurring ? (
                        <RefreshCw className="w-3 h-3 shrink-0 opacity-80" />
                      ) : (
                        <CalendarIcon className="w-3 h-3 shrink-0 opacity-80" />
                      )}
                      <span className="truncate">
                        {utcTimeToLocalHm(s.start_time, ymd)} - {utcTimeToLocalHm(s.end_time, ymd)}
                      </span>
                    </div>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-6 mt-3 text-sm text-gray-600">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded bg-emerald-100 border border-emerald-300" />
            Available
          </span>
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-700" />
            Recurring
          </span>
        </div>
          </div>
        </div>

        <div className="w-full min-w-0 lg:w-[30%] lg:shrink-0 flex flex-col">
          <h2 className="text-sm font-bold tracking-wide text-blue-900 mb-3 shrink-0">ALL AVAILABILITY SLOTS</h2>
          <div
            className="min-h-0 max-h-[min(60vh,32rem)] sm:max-h-[min(65vh,36rem)] lg:max-h-[calc(100vh-11rem)] overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable] space-y-3 pr-1"
            aria-label="All availability slots"
          >
          {slotsForList.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-200 rounded-xl">
              No availability slots yet. Click &quot;Add Time Slot&quot; to get started.
            </p>
          ) : (
            slotsForList.map((slot) => (
              <div
                key={slot.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm"
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                    slot.is_recurring ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {slot.is_recurring ? (
                    <RefreshCw className="w-6 h-6" />
                  ) : (
                    <CalendarIcon className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">
                    {slot.label?.trim() || (slot.is_recurring ? 'Recurring availability' : 'Availability')}
                  </div>
                  <div className="text-sm text-gray-700 mt-0.5">
                    {utcTimeToLocalHm(
                      slot.start_time,
                      slot.is_recurring
                        ? (slot.repeat_start ? String(slot.repeat_start).slice(0, 10) : toYmd(new Date()))
                        : (slot.specific_date ? String(slot.specific_date).slice(0, 10) : toYmd(new Date()))
                    )}{' '}
                    -{' '}
                    {utcTimeToLocalHm(
                      slot.end_time,
                      slot.is_recurring
                        ? (slot.repeat_start ? String(slot.repeat_start).slice(0, 10) : toYmd(new Date()))
                        : (slot.specific_date ? String(slot.specific_date).slice(0, 10) : toYmd(new Date()))
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {slot.is_recurring
                      ? formatRepeatSubtitle(slot)
                      : slot.specific_date
                        ? formatListDateLong(String(slot.specific_date).slice(0, 10))
                        : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => openEdit(slot)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                    aria-label="Edit"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDelete(slot.id)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      </div>

      {addOpen &&
        formModal({
          title: 'Add Time Slot',
          subtitle: 'Set a recurring time slot for your availability.',
          onClose: () => {
            setError(null)
            closeAdd()
          },
          onSubmit: handleSaveAdd,
          submitLabel: 'Add Slot',
          variant: 'add',
        })}

      {editOpen &&
        formModal({
          title: 'Edit Availability',
          subtitle: 'Set a recurring time slot for your availability.',
          onClose: () => {
            setError(null)
            closeEdit()
          },
          onSubmit: handleSaveEdit,
          submitLabel: 'Update Slot',
          variant: 'edit',
          showRemove: true,
        })}

      {deleteOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40"
          role="presentation"
          onClick={() => {
            setDeleteOpen(false)
            setDeletingId(null)
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-availability-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="remove-availability-title" className="text-lg font-semibold text-gray-900">
              Remove Availability Slot
            </h3>
            <p className="text-sm text-gray-600 mt-2">
              Are you sure you want to remove this availability slot? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setDeleteOpen(false)
                  setDeletingId(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={handleDelete}
                disabled={saving}
                loading={saving}
                icon={Trash2}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
