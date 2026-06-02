'use client'

import { CalendarDays, Key, MapPin } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'
import { CaregiverDocumentsPanel } from './CaregiverDocumentsPanel'
import InternalNotesPanel from './InternalNotesPanel'
import { patientFullName } from '@/lib/patient-name'

interface StaffMember {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  role: string
  status: string
  start_date?: string | null
  pay_rate?: string | number | null
  address?: string | null
  state?: string | null
  zip_code?: string | null
  skills?: string[] | null
  documents?: PatientDocument[] | null
}

interface StaffLicense {
  id: string
  caregiver_member_id: string
  license_type: string
  license_number: string
  state?: string | null
  status: string
  expiry_date?: string | null
  days_until_expiry?: number | null
}

type CaregiverPayRateHistoryRow = {
  id: string
  pay_rate: number | null
  unit_type: string | null
  service_type: string | null
  effective_start: string
  effective_end: string | null
  created_at: string
}

type CaregiverScheduleRow = {
  id: string
  patient_id: string | null
  visit_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  service_type: string | null
  status: string | null
  is_recurring: boolean | null
}

type TabId = 'overview' | 'credentials' | 'schedule' | 'notes'

export default function CaregiverProfileContent({
  staff,
  licenses,
  currentPayRate: currentPayRateProp,
  backHref,
  documentsPanelActive = true,
  onDocumentsBusyChange,
  canManageNotes = false,
  agencyId,
}: {
  staff: StaffMember
  licenses: StaffLicense[]
  /** From `caregiver_pay_rates` when provided by the caregivers list page. */
  currentPayRate?: number | null
  backHref?: string
  /** When false, document panel does not sync (e.g. parent view hidden). */
  documentsPanelActive?: boolean
  /** e.g. block closing a modal while upload/delete is in progress. */
  onDocumentsBusyChange?: (busy: boolean) => void
  canManageNotes?: boolean
  agencyId?: string
}) {
  const todayYmd = new Date().toISOString().slice(0, 10)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const activeLicenses = licenses.filter((l) => l.status === 'active')
  const stateZip = [staff.state, staff.zip_code].filter(Boolean).join(' ')
  const homeAddressLine = [staff.address, stateZip].filter(Boolean).join(', ')

  const skills = staff.skills ?? []
  const displayPayRate: number | null = (() => {
    if (currentPayRateProp !== undefined) {
      return currentPayRateProp !== null && Number.isFinite(currentPayRateProp) ? currentPayRateProp : null
    }
    if (staff.pay_rate !== null && staff.pay_rate !== undefined && staff.pay_rate !== '') {
      const n = typeof staff.pay_rate === 'number' ? staff.pay_rate : Number(staff.pay_rate)
      return Number.isFinite(n) ? n : null
    }
    return null
  })()

  const [skillCatalog, setSkillCatalog] = useState<{ type: string; name: string }[]>([])
  const [payRateHistory, setPayRateHistory] = useState<CaregiverPayRateHistoryRow[]>([])
  const [isPayRateHistoryLoading, setIsPayRateHistoryLoading] = useState(false)
  const [caregiverSchedules, setCaregiverSchedules] = useState<CaregiverScheduleRow[]>([])
  const [patientNameById, setPatientNameById] = useState<Record<string, string>>({})
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(false)
  const [schedulesError, setSchedulesError] = useState<string | null>(null)

  const skillTypeByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of skillCatalog) map.set(s.name, s.type)
    return map
  }, [skillCatalog])

  const skillTypeToPillClass: Record<string, string> = {
    'Clinical Care': 'bg-red-100 text-red-700 border border-red-200',
    'Specialty Conditions': 'bg-purple-100 text-purple-700 border border-purple-200',
    'Physical Support': 'bg-amber-100 text-amber-700 border border-amber-200',
    'Daily Living': 'bg-green-100 text-green-700 border border-green-200',
    Certifications: 'bg-blue-100 text-blue-700 border border-blue-200',
    Language: 'bg-teal-100 text-teal-700 border border-teal-200',
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const supabase = createClient()
      const { data } = await q.getCaregiverSkillCatalogFromTaskRequirements(supabase)
      if (!cancelled) setSkillCatalog(data ?? [])
    }
    run()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setIsPayRateHistoryLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('caregiver_pay_rates')
        .select('id, pay_rate, unit_type, service_type, effective_start, effective_end, created_at')
        .eq('caregiver_member_id', staff.id)
        .order('effective_start', { ascending: false })
      if (cancelled) return
      setPayRateHistory((data ?? []) as CaregiverPayRateHistoryRow[])
      setIsPayRateHistoryLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [staff.id])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setIsSchedulesLoading(true)
      setSchedulesError(null)
      const supabase = createClient()
      const { data: upcomingData, error: upcomingErr } = await supabase
        .from('scheduled_visits')
        .select('id, patient_id, visit_date, scheduled_start_time, scheduled_end_time, service_type, status, is_recurring')
        .eq('caregiver_member_id', staff.id)
        .gte('visit_date', todayYmd)
        .order('visit_date', { ascending: true })
        .limit(20)

      if (cancelled) return
      if (upcomingErr) {
        setSchedulesError(upcomingErr.message ?? 'Failed to load schedules.')
        setIsSchedulesLoading(false)
        return
      }

      let rows = (upcomingData ?? []) as CaregiverScheduleRow[]
      if (rows.length === 0) {
        const { data: recentData, error: recentErr } = await supabase
          .from('scheduled_visits')
          .select('id, patient_id, visit_date, scheduled_start_time, scheduled_end_time, service_type, status, is_recurring')
          .eq('caregiver_member_id', staff.id)
          .order('visit_date', { ascending: false })
          .limit(10)
        if (cancelled) return
        if (recentErr) {
          setSchedulesError(recentErr.message ?? 'Failed to load schedules.')
          setIsSchedulesLoading(false)
          return
        }
        rows = (recentData ?? []) as CaregiverScheduleRow[]
      }

      setCaregiverSchedules(rows)

      const patientIds = Array.from(new Set(rows.flatMap((r) => (r.patient_id ? [r.patient_id] : []))))
      if (patientIds.length > 0) {
        const { data: patientsData } = await supabase
          .from('patients')
          .select('id, first_name, last_name')
          .in('id', patientIds)
        if (!cancelled) {
          const map: Record<string, string> = {}
          for (const row of patientsData ?? []) {
            map[String(row.id)] = patientFullName(row as { first_name: string; last_name: string })
          }
          setPatientNameById(map)
        }
      } else {
        setPatientNameById({})
      }

      if (!cancelled) setIsSchedulesLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [staff.id, todayYmd])

  const formatServiceTypeLabel = (serviceType: string | null | undefined) => {
    if (!serviceType) return 'All Services'
    return serviceType === 'skilled' ? 'Skilled' : 'Non-skilled'
  }

  const formatUnitTypeLabel = (unitType: string | null | undefined) => {
    if (unitType === 'visit') return '/visit'
    if (unitType === '15_min_unit') return '/15m unit'
    return '/hr'
  }

  const formatTime = (raw: string | null | undefined) => {
    if (!raw) return '--:--'
    return String(raw).slice(0, 5)
  }

  const formatVisitStatus = (status: string | null | undefined) => {
    const s = String(status ?? '').toLowerCase()
    if (s === 'completed') return { label: 'Completed', className: 'bg-emerald-100 text-emerald-700' }
    if (s === 'cancelled') return { label: 'Cancelled', className: 'bg-gray-200 text-gray-700' }
    if (s === 'in_progress') return { label: 'In Progress', className: 'bg-blue-100 text-blue-700' }
    if (s === 'missed') return { label: 'Missed', className: 'bg-red-100 text-red-700' }
    return { label: s ? s.replace('_', ' ') : 'Scheduled', className: 'bg-amber-100 text-amber-800' }
  }

  const formatServiceType = (serviceType: string | null | undefined) =>
    serviceType === 'skilled' ? 'Skilled' : 'Non-skilled'

  const showNotesTab = !!(canManageNotes && agencyId)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'credentials', label: 'Credentials' },
    { id: 'schedule', label: 'Schedule' },
    ...(showNotesTab ? [{ id: 'notes' as TabId, label: 'Notes' }] : []),
  ]

  return (
    <div className="space-y-4">
      {/* Back button */}
      {backHref ? (
        <Link
          href={`${backHref}?tab=schedule`}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      ) : null}

      {/* Caregiver name header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{`${staff.first_name} ${staff.last_name}`}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{staff.role}</p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            staff.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {staff.status}
        </span>
      </div>

      {/* Tab navigation */}
      <div className="flex overflow-x-auto border-b border-gray-200 -mx-6 px-6 gap-1 scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-5 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Email</div>
              <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm font-medium text-gray-900">{staff.email}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Phone</div>
              <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm font-medium text-gray-900">{staff.phone ?? '-'}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Pay Rate</div>
              <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm font-medium text-gray-900">
                {displayPayRate !== null && Number.isFinite(displayPayRate) ? `$${displayPayRate.toFixed(2)}/hr` : '$--'}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-green-600" />
                Home Address
              </div>
              <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm font-medium text-gray-900">{homeAddressLine || '-'}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials tab ── */}
      {activeTab === 'credentials' && (
        <div className="space-y-6 pt-1">
          {/* Certifications & Licenses */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-blue-600" />
              Certifications & Licenses
            </h4>
            {activeLicenses.length > 0 ? (
              <div className="space-y-3">
                {activeLicenses.map((license) => {
                  const daysRemaining =
                    license.days_until_expiry !== null && license.days_until_expiry !== undefined
                      ? license.days_until_expiry
                      : null
                  return (
                    <div key={license.id} className="bg-gray-50 rounded-xl px-4 py-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{license.license_type}</span>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Active</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {license.license_number}
                          {license.state ? ` • ${license.state}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-gray-500 mb-1">Expires</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {license.expiry_date ? formatDate(license.expiry_date) : 'N/A'}
                        </div>
                        {daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 60 ? (
                          <div className="text-sm text-orange-600 font-medium mt-1">
                            {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No active licenses or certifications</div>
            )}
          </div>

          {/* Skills */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Skills</h4>
            <div className="flex flex-wrap gap-2">
              {skills.length > 0 ? (
                skills.map((s) => {
                  const type = skillTypeByName.get(s)
                  const pillClass =
                    skillTypeToPillClass[type ?? ''] ?? 'bg-gray-100 text-gray-700 border border-gray-200'
                  return (
                    <span key={s} className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${pillClass}`}>
                      {s}
                    </span>
                  )
                })
              ) : (
                <span className="text-sm text-gray-400">No skills added yet.</span>
              )}
            </div>
          </div>

          {/* Documents */}
          <CaregiverDocumentsPanel
            active={documentsPanelActive}
            staffMemberId={staff.id}
            caregiverName={`${staff.first_name} ${staff.last_name}`.trim()}
            initialDocuments={staff.documents}
            readOnly
            onBusyChange={onDocumentsBusyChange}
          />
        </div>
      )}

      {/* ── Schedule tab ── */}
      {activeTab === 'schedule' && (
        <div className="space-y-6 pt-1">
          {/* Caregiver Schedules */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              Caregiver Schedules
            </h4>
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Date</th>
                      <th className="text-left px-3 py-2 font-semibold">Time</th>
                      <th className="text-left px-3 py-2 font-semibold">Client</th>
                      <th className="text-left px-3 py-2 font-semibold">Service</th>
                      <th className="text-left px-3 py-2 font-semibold">Type</th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isSchedulesLoading ? (
                      <tr><td className="px-3 py-6 text-gray-500" colSpan={6}>Loading caregiver schedules...</td></tr>
                    ) : schedulesError ? (
                      <tr><td className="px-3 py-6 text-red-600" colSpan={6}>{schedulesError}</td></tr>
                    ) : caregiverSchedules.length === 0 ? (
                      <tr><td className="px-3 py-6 text-gray-500" colSpan={6}>No schedules found for this caregiver.</td></tr>
                    ) : (
                      caregiverSchedules.map((row) => {
                        const statusInfo = formatVisitStatus(row.status)
                        return (
                          <tr key={row.id} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-700">{row.visit_date ?? '-'}</td>
                            <td className="px-3 py-2 text-gray-700">
                              {formatTime(row.scheduled_start_time)} - {formatTime(row.scheduled_end_time)}
                            </td>
                            <td className="px-3 py-2 text-gray-900 font-medium">
                              {row.patient_id ? patientNameById[row.patient_id] ?? 'Client' : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{formatServiceType(row.service_type)}</td>
                            <td className="px-3 py-2 text-gray-700">{row.is_recurring ? 'Recurring' : 'One-time'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Shows upcoming visits first (up to 20). If no upcoming visits exist, recent visits are shown.
            </p>
          </div>

          {/* Pay Rate History */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Pay Rate History</h4>
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Rate</th>
                      <th className="text-left px-3 py-2 font-semibold">Service Type</th>
                      <th className="text-left px-3 py-2 font-semibold">Effective Start</th>
                      <th className="text-left px-3 py-2 font-semibold">Effective End</th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isPayRateHistoryLoading ? (
                      <tr><td className="px-3 py-6 text-gray-500" colSpan={5}>Loading pay rate history...</td></tr>
                    ) : payRateHistory.length === 0 ? (
                      <tr><td className="px-3 py-6 text-gray-500" colSpan={5}>No pay rate history found.</td></tr>
                    ) : (
                      payRateHistory.map((row) => {
                        const start = String(row.effective_start ?? '')
                        const end = row.effective_end ? String(row.effective_end) : null
                        const isActive = start <= todayYmd && (end == null || end > todayYmd)
                        const rateNum = row.pay_rate != null ? Number(row.pay_rate) : NaN
                        return (
                          <tr key={row.id} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {Number.isFinite(rateNum)
                                ? `$${rateNum.toFixed(2)}${formatUnitTypeLabel(row.unit_type)}`
                                : '$--'}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{formatServiceTypeLabel(row.service_type)}</td>
                            <td className="px-3 py-2 text-gray-700">{row.effective_start ?? '-'}</td>
                            <td className="px-3 py-2 text-gray-700">{row.effective_end ?? 'Open'}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {isActive ? 'Active' : 'Closed'}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Notes tab — agency admins and care coordinators only ── */}
      {activeTab === 'notes' && showNotesTab && (
        <div className="pt-1">
          <InternalNotesPanel
            subjectType="caregiver"
            subjectId={staff.id}
            agencyId={agencyId!}
            canManage={canManageNotes}
          />
        </div>
      )}
    </div>
  )
}
