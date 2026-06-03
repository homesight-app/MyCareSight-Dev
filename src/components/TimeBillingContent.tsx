'use client'

import { useMemo, useState, useTransition } from 'react'
import { CalendarDays, ChevronDown, ChevronUp, Pencil, Search, SlidersHorizontal } from 'lucide-react'
import type { TimeBillingRow, TimeBillingStatus } from '@/lib/time-billing-dashboard'
import { approveTimeBillingRowAction, voidTimeBillingRowAction } from '@/app/actions/time-billing'

type Props = {
  rows: TimeBillingRow[]
  loadError?: string
}

function money(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Pending-tab estimate when hours are edited (hourly assumption; matches common contract). */
function estLineAmount(hours: number, rate: number): number {
  if (!Number.isFinite(hours) || !Number.isFinite(rate)) return 0
  return round2(hours * rate)
}

function toLabel(status: TimeBillingStatus): string {
  if (status === 'approved') return 'Approved'
  if (status === 'voided') return 'Voided'
  return 'Pending'
}

/** Short label for approved/voided table so the column stays narrow. */
function noteCellLabel(note: string | null | undefined): string {
  if (note == null || String(note).trim() === '') return '-'
  const s = String(note)
  if (s.length <= 10) return s
  return `${s.slice(0, 10)}…`
}

export default function TimeBillingContent({ rows, loadError }: Props) {
  const [activeTab, setActiveTab] = useState<TimeBillingStatus>('pending')
  const [pendingEdits, setPendingEdits] = useState<
    Record<
      string,
      { actualHours: string; billableHours: string; note: string; serviceType: 'non_skilled' | 'skilled' }
    >
  >({})
  const [actualHoursEditingId, setActualHoursEditingId] = useState<string | null>(null)
  const [billableHoursEditingId, setBillableHoursEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterCaregiverId, setFilterCaregiverId] = useState<string>('all')
  const [filterClientId, setFilterClientId] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const caregiverOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      const id = r.caregiverId || ''
      const label = id ? r.caregiverName : 'Unassigned'
      if (!map.has(id)) map.set(id, label)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [rows])

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      if (r.clientId) map.set(r.clientId, r.clientName)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [rows])

  const rowsMatchingFilters = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filterCaregiverId !== 'all' && (r.caregiverId || '') !== filterCaregiverId) return false
      if (filterClientId !== 'all' && r.clientId !== filterClientId) return false
      if (filterDateFrom && r.date && r.date < filterDateFrom) return false
      if (filterDateTo && r.date && r.date > filterDateTo) return false
      if (q && !`${r.clientName} ${r.caregiverName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, filterCaregiverId, filterClientId, filterDateFrom, filterDateTo, query])

  const counts = useMemo(
    () => ({
      pending: rowsMatchingFilters.filter((r) => r.status === 'pending').length,
      approved: rowsMatchingFilters.filter((r) => r.status === 'approved').length,
      voided: rowsMatchingFilters.filter((r) => r.status === 'voided').length,
    }),
    [rowsMatchingFilters]
  )

  const list = useMemo(
    () => rowsMatchingFilters.filter((r) => r.status === activeTab),
    [rowsMatchingFilters, activeTab]
  )

  const summary = useMemo(() => {
    const approved = rowsMatchingFilters.filter((r) => r.status === 'approved')
    const pending = rowsMatchingFilters.filter((r) => r.status === 'pending')
    return {
      awaitingApproval: pending.length,
      approvedHours: approved.reduce((sum, r) => sum + (r.billableHours || 0), 0),
      totalMileage: approved.reduce((sum, r) => sum + (r.mileageMiles || 0), 0),
    }
  }, [rowsMatchingFilters])

  const hasStructuralFilters =
    filterCaregiverId !== 'all' || filterClientId !== 'all' || filterDateFrom !== '' || filterDateTo !== ''

  const clearStructuralFilters = () => {
    setFilterCaregiverId('all')
    setFilterClientId('all')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const getEdit = (row: TimeBillingRow) =>
    pendingEdits[row.id] ?? {
      actualHours: String(row.actualHours ?? 0),
      billableHours: String(row.billableHours ?? 0),
      note: row.note ?? '',
      serviceType: row.serviceType,
    }

  const pendingPayload = (row: TimeBillingRow) => {
    const edit = getEdit(row)
    return {
      scheduledVisitId: row.scheduledVisitId,
      actualHours: Number(edit.actualHours),
      billableHours: Number(edit.billableHours),
      note: edit.note,
      serviceType: edit.serviceType,
    }
  }

  const hoursEditedForRow = (row: TimeBillingRow): boolean => {
    const edit = getEdit(row)
    const rowActual = round2(Number(row.actualHours ?? 0))
    const rowBillable = round2(Number(row.billableHours ?? 0))
    const editedActual = round2(Number(edit.actualHours))
    const editedBillable = round2(Number(edit.billableHours))
    if (!Number.isFinite(editedActual) || !Number.isFinite(editedBillable)) return false
    return rowActual !== editedActual || rowBillable !== editedBillable
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">Hours Approval</h1>
        <p className="text-sm text-gray-600 mt-1">
          Review completed visits, confirm hours and service type, then approve for payroll.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-2xl font-bold">{summary.awaitingApproval}</div>
          <div className="text-xs text-gray-500">Awaiting Approval</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-2xl font-bold">{summary.approvedHours.toFixed(1)} hrs</div>
          <div className="text-xs text-gray-500">Approved Hours</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-2xl font-bold">{summary.totalMileage.toFixed(1)} mi</div>
          <div className="text-xs text-gray-500">Approved Mileage</div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {(['pending', 'approved', 'voided'] as TimeBillingStatus[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`inline-flex items-center gap-2 pb-2 border-b-2 transition-colors ${
                      activeTab === tab ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'pending' ? (
                      <>
                        {toLabel(tab)}
                        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {counts.pending}
                        </span>
                      </>
                    ) : (
                      <>
                        {toLabel(tab)} <span className="text-gray-500 font-normal">({counts[tab]})</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto lg:min-w-0 lg:flex-1 lg:justify-end">
                <div className="relative flex-1 min-w-0 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                  <input
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Search..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search visits"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((o) => !o)}
                  className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    filtersOpen || hasStructuralFilters
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                  }`}
                  aria-expanded={filtersOpen}
                  aria-controls="time-billing-filters"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  Filters
                  {filtersOpen ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            {filtersOpen ? (
              <div
                id="time-billing-filters"
                className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500" htmlFor="tb-filter-caregiver">
                    Caregiver
                  </label>
                  <select
                    id="tb-filter-caregiver"
                    value={filterCaregiverId}
                    onChange={(e) => setFilterCaregiverId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="all">All Caregivers</option>
                    {caregiverOptions.map((o) => (
                      <option key={o.id === '' ? '__none__' : o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500" htmlFor="tb-filter-client">
                    Client
                  </label>
                  <select
                    id="tb-filter-client"
                    value={filterClientId}
                    onChange={(e) => setFilterClientId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="all">All Clients</option>
                    {clientOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500" htmlFor="tb-filter-from">
                    Date from
                  </label>
                  <div className="relative">
                    <input
                      id="tb-filter-from"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500" htmlFor="tb-filter-to">
                    Date to
                  </label>
                  <div className="relative">
                    <input
                      id="tb-filter-to"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                  </div>
                </div>
                {hasStructuralFilters ? (
                  <div className="col-span-full flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={clearStructuralFilters}
                      className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {(loadError || error) && <div className="px-4 py-2 text-sm text-red-600">{loadError || error}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm text-gray-900">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                {activeTab !== 'voided' ? <th className="text-left px-3 py-2">Client</th> : null}
                <th className="text-left px-3 py-2">Caregiver</th>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Actual Hours</th>
                <th className="text-left px-3 py-2">Billable Hours</th>
                <th className="text-left px-3 py-2">Service Type</th>
                <th className="text-left px-3 py-2">Miles</th>
                <th className="text-left px-3 py-2">Note * if edited</th>
                <th className="text-left px-3 py-2">{activeTab === 'pending' ? 'Actions' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => {
                const edit = getEdit(row)
                const actualHoursNum = Number(edit.actualHours)
                const billableHoursNum = Number(edit.billableHours)
                const isHoursEdited = hoursEditedForRow(row)
                const requiresNoteForApprove = isHoursEdited && edit.note.trim() === ''
                const mileageEdit = edit as typeof edit & { mileageMiles?: string }
                const editedMiles = mileageEdit.mileageMiles ?? String(row.mileageMiles ?? 0)

                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">{row.date}</td>
                    {activeTab !== 'voided' ? <td className="px-3 py-2">{row.clientName}</td> : null}
                    <td className="px-3 py-2">{row.caregiverName}</td>
                    <td className="px-3 py-2">{row.timeLabel}</td>
                    <td className="px-3 py-2 group">
                      {activeTab === 'pending' ? (
                        actualHoursEditingId === row.id ? (
                          <input
                            autoFocus
                            value={edit.actualHours}
                            onChange={(e) =>
                              setPendingEdits((prev) => ({
                                ...prev,
                                [row.id]: { ...edit, actualHours: e.target.value },
                              }))
                            }
                            onBlur={() => setActualHoursEditingId(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') setActualHoursEditingId(null)
                            }}
                            className="w-20 rounded border border-blue-300 px-2 py-1"
                            inputMode="decimal"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 min-h-[36px]">
                            <span className="tabular-nums">
                              {Number.isFinite(Number(edit.actualHours))
                                ? Number(edit.actualHours).toFixed(2)
                                : edit.actualHours}
                            </span>
                            <button
                              type="button"
                              className="inline-flex p-1 rounded text-gray-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-blue-50 transition-opacity"
                              aria-label="Edit actual hours"
                              onClick={() => setActualHoursEditingId(row.id)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      ) : (
                        row.actualHours.toFixed(2)
                      )}
                    </td>
                    <td className="px-3 py-2 group">
                      {activeTab === 'pending' ? (
                        billableHoursEditingId === row.id ? (
                          <input
                            autoFocus
                            value={edit.billableHours}
                            onChange={(e) =>
                              setPendingEdits((prev) => ({
                                ...prev,
                                [row.id]: { ...edit, billableHours: e.target.value },
                              }))
                            }
                            onBlur={() => setBillableHoursEditingId(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') setBillableHoursEditingId(null)
                            }}
                            className="w-20 rounded border border-blue-300 px-2 py-1"
                            inputMode="decimal"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 min-h-[36px]">
                            <span className="tabular-nums">
                              {Number.isFinite(Number(edit.billableHours))
                                ? Number(edit.billableHours).toFixed(2)
                                : edit.billableHours}
                            </span>
                            <button
                              type="button"
                              className="inline-flex p-1 rounded text-gray-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-blue-50 transition-opacity"
                              aria-label="Edit billable hours"
                              onClick={() => setBillableHoursEditingId(row.id)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      ) : (
                        row.billableHours.toFixed(2)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {activeTab === 'pending' ? (
                        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100/80 p-0.5 gap-0.5">
                          <button
                            type="button"
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                              edit.serviceType === 'non_skilled'
                                ? 'bg-amber-400 text-amber-950 shadow-sm ring-1 ring-amber-500/40'
                                : 'text-gray-500 hover:bg-amber-100/60 hover:text-amber-900'
                            }`}
                            onClick={() =>
                              setPendingEdits((prev) => ({
                                ...prev,
                                [row.id]: { ...edit, serviceType: 'non_skilled' },
                              }))
                            }
                          >
                            Non-skilled
                          </button>
                          <button
                            type="button"
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                              edit.serviceType === 'skilled'
                                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700/30'
                                : 'text-gray-500 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                            onClick={() =>
                              setPendingEdits((prev) => ({
                                ...prev,
                                [row.id]: { ...edit, serviceType: 'skilled' },
                              }))
                            }
                          >
                            Skilled
                          </button>
                        </div>
                      ) : (
                        <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          {row.serviceType === 'skilled' ? 'Skilled' : 'Non-skilled'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 group">
                      {activeTab === 'pending' ? (
                        <div className="flex items-center gap-1.5 min-h-[36px]">
                          <input
                            value={editedMiles}
                            onChange={(e) =>
                              setPendingEdits((prev) => ({
                                ...prev,
                                [row.id]: { ...edit, mileageMiles: e.target.value } as typeof edit,
                              }))
                            }
                            onBlur={async () => {
                              const miles = parseFloat(editedMiles)
                              const newMiles = Number.isFinite(miles) && miles >= 0 ? miles : null
                              if (newMiles !== row.mileageMiles) {
                                const { updateVisitMileageAction } = await import('@/app/actions/time-billing')
                                await updateVisitMileageAction(row.scheduledVisitId, newMiles)
                              }
                            }}
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-sm"
                            inputMode="decimal"
                            placeholder="0"
                          />
                          <span className="text-xs text-gray-400">mi</span>
                        </div>
                      ) : (
                        <span className="tabular-nums">{row.mileageMiles > 0 ? `${row.mileageMiles} mi` : '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {activeTab === 'pending' ? (
                        <input
                          value={edit.note}
                          onChange={(e) =>
                            setPendingEdits((prev) => ({ ...prev, [row.id]: { ...edit, note: e.target.value } }))
                          }
                          className="w-full min-w-[10rem] max-w-[14rem] rounded border border-gray-200 px-2 py-1.5 text-sm"
                          placeholder={isHoursEdited ? 'Required when hours edited' : 'Optional note...'}
                        />
                      ) : (
                        <span className="inline-block" title={row.note ?? undefined}>
                          {noteCellLabel(row.note)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {activeTab === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isPending || requiresNoteForApprove}
                            className="rounded-full bg-emerald-600 text-white px-3 py-1 text-xs font-semibold disabled:opacity-60"
                            title={requiresNoteForApprove ? 'Add a note after editing hours before approving.' : undefined}
                            onClick={() => {
                              setError(null)
                              startTransition(async () => {
                                const res = await approveTimeBillingRowAction(pendingPayload(row))
                                if (res && 'error' in res && res.error) setError(res.error)
                              })
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            className="rounded-full border px-3 py-1 text-xs font-semibold text-gray-700 disabled:opacity-60"
                            onClick={() => {
                              setError(null)
                              startTransition(async () => {
                                const res = await voidTimeBillingRowAction(pendingPayload(row))
                                if (res && 'error' in res && res.error) setError(res.error)
                              })
                            }}
                          >
                            Void
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                            row.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {toLabel(row.status)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {list.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500" colSpan={13}>
                    No records found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
