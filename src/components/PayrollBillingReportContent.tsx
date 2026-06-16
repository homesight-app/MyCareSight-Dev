'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Clock,
  Download,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Users,
} from 'lucide-react'
import type { PayrollBillingDetailRow } from '@/lib/payroll-billing-report'
import {
  getPayrollBillingReportRowsAction,
  getRateManagerDataAction,
  updatePatientServiceContractBillRateAction,
  updateCaregiverPayRateFromManagerAction,
  type RateManagerBillRow,
  type RateManagerPayRow,
} from '@/app/actions/payroll-billing-report'
import Modal from '@/components/Modal'

type TabKey = 'detail' | 'payroll' | 'billing'

function money(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

function formatRangeLabel(from: string, to: string): string {
  const a = new Date(`${from}T12:00:00`)
  const b = new Date(`${to}T12:00:00`)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  return `${a.toLocaleDateString('en-US', opts)} – ${b.toLocaleDateString('en-US', opts)}`
}

function serviceBadgeClass(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('skilled')) return 'bg-blue-100 text-blue-800 border-blue-200'
  if (l.includes('homemaker') || l.includes('companion')) return 'bg-amber-50 text-amber-900 border-amber-200'
  return 'bg-sky-50 text-sky-900 border-sky-200'
}

function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((part / total) * 100)
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (c: string | number) => {
    const s = String(c)
    return `"${s.replace(/"/g, '""')}"`
  }
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type Props = {
  initialRows: PayrollBillingDetailRow[]
  initialDateFrom: string
  initialDateTo: string
  loadError?: string
}

export default function PayrollBillingReportContent({
  initialRows,
  initialDateFrom,
  initialDateTo,
  loadError,
}: Props) {
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)
  const [rows, setRows] = useState<PayrollBillingDetailRow[]>(initialRows)
  const [error, setError] = useState<string | null>(loadError ?? null)
  const [searchQuery, setSearchQuery] = useState('')
  const [tab, setTab] = useState<TabKey>('detail')
  const [isPending, startTransition] = useTransition()
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const router = useRouter()

  const reload = useCallback(() => {
    setError(null)
    startTransition(async () => {
      const res = await getPayrollBillingReportRowsAction(dateFrom, dateTo)
      if (res.error) setError(res.error)
      setRows(res.rows)
    })
  }, [dateFrom, dateTo])

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      `${r.clientName} ${r.caregiverName} ${r.serviceTypeLabel}`.toLowerCase().includes(q)
    )
  }, [rows, searchQuery])

  const summary = useMemo(() => {
    const totalHours = filtered.reduce((s, r) => s + r.actualHours, 0)
    const totalPay = filtered.reduce((s, r) => s + r.payAmount, 0)
    const totalBill = filtered.reduce((s, r) => s + r.billAmount, 0)
    const caregiverIds = new Set(filtered.map((r) => r.caregiverId).filter(Boolean))
    const clientIds = new Set(filtered.map((r) => r.clientId))
    const pendingVisitCount = filtered.filter((r) => r.billingState === 'pending').length
    return {
      totalHours,
      totalPay,
      totalBill,
      visitCount: filtered.length,
      pendingVisitCount,
      caregiverCount: caregiverIds.size,
      clientCount: clientIds.size,
    }
  }, [filtered])

  const payrollByCaregiver = useMemo(() => {
    const map = new Map<string, {
      name: string; payRate: number
      hours: number; regHours: number; otHours: number; holidayHours: number; weekendHours: number
      regPay: number; otPay: number; holidayPay: number; weekendPay: number
      mileageMiles: number; mileagePayAmount: number; pay: number
    }>()
    for (const r of filtered) {
      if (!r.caregiverId) continue
      const cur = map.get(r.caregiverId) ?? {
        name: r.caregiverName, payRate: r.payRate,
        hours: 0, regHours: 0, otHours: 0, holidayHours: 0, weekendHours: 0,
        regPay: 0, otPay: 0, holidayPay: 0, weekendPay: 0,
        mileageMiles: 0, mileagePayAmount: 0, pay: 0,
      }
      cur.name = r.caregiverName
      cur.payRate = r.payRate
      cur.hours += r.actualHours
      cur.regHours += r.regHours ?? 0
      cur.otHours += r.otHours ?? 0
      cur.holidayHours += r.holidayHours ?? 0
      cur.weekendHours += r.weekendHours ?? 0
      cur.regPay += r.regPay ?? 0
      cur.otPay += r.otPay ?? 0
      cur.holidayPay += r.holidayPay ?? 0
      cur.weekendPay += r.weekendPay ?? 0
      cur.mileageMiles += r.mileageMiles ?? 0
      cur.mileagePayAmount += r.mileagePayAmount ?? 0
      cur.pay += r.payAmount
      map.set(r.caregiverId, cur)
    }
    type PayrollRow = { id: string; name: string; payRate: number; hours: number; regHours: number; otHours: number; holidayHours: number; weekendHours: number; regPay: number; otPay: number; holidayPay: number; weekendPay: number; mileageMiles: number; mileagePayAmount: number; pay: number }
    const list: PayrollRow[] = []
    map.forEach((v, id) => list.push({ id, ...v }))
    return list
  }, [filtered])

  const billingByClient = useMemo(() => {
    const map = new Map<string, {
      name: string; billRate: number
      hours: number; hoursBill: number; mileageMiles: number; mileageBill: number; bill: number
    }>()
    for (const r of filtered) {
      const cur = map.get(r.clientId) ?? {
        name: r.clientName, billRate: r.billRate,
        hours: 0, hoursBill: 0, mileageMiles: 0, mileageBill: 0, bill: 0,
      }
      cur.name = r.clientName
      cur.billRate = r.billRate
      cur.hours += r.billableHours
      cur.mileageMiles += r.mileageMiles ?? 0
      cur.mileageBill += r.mileageBillAmount ?? 0
      cur.bill += r.billAmount
      cur.hoursBill = cur.bill - cur.mileageBill
      map.set(r.clientId, cur)
    }
    type BillingRow = { id: string; name: string; billRate: number; hours: number; hoursBill: number; mileageMiles: number; mileageBill: number; bill: number }
    const list: BillingRow[] = []
    map.forEach((v, id) => list.push({ id, ...v }))
    return list
  }, [filtered])

  const exportDetailCsv = () => {
    downloadCsv(
      `payroll-billing-detail-${dateFrom}-${dateTo}.csv`,
      [
        'Client', 'Caregiver', 'Service Type', 'Service Date', 'Start', 'End',
        'Actual Hrs', 'Billable Hrs',
        'REG Hrs', 'OT Hrs', 'Holiday Hrs', 'Weekend Hrs',
        'Pay Rate', 'REG Pay', 'OT Pay', 'Holiday Pay', 'Weekend Pay',
        'Miles', 'Mileage Pay $', 'Total Pay',
        'Bill Rate', 'Hours Bill', 'Mileage Bill $', 'Total Bill',
        'Status',
      ],
      filtered.map((r) => [
        r.clientName, r.caregiverName, r.serviceTypeLabel, r.visitDate, r.startTime, r.endTime,
        r.actualHours, r.billableHours,
        r.regHours ?? 0, r.otHours ?? 0, r.holidayHours ?? 0, r.weekendHours ?? 0,
        r.payRate, r.regPay ?? 0, r.otPay ?? 0, r.holidayPay ?? 0, r.weekendPay ?? 0,
        r.mileageMiles ?? 0, r.mileagePayAmount ?? 0, r.payAmount,
        r.billRate, (r.billAmount - (r.mileageBillAmount ?? 0)).toFixed(2), r.mileageBillAmount ?? 0, r.billAmount,
        r.billingState === 'pending' ? 'Pending' : r.billingState === 'voided' ? 'Voided' : 'Approved',
      ])
    )
  }

  const exportPayrollCsv = () => {
    downloadCsv(
      `payroll-summary-${dateFrom}-${dateTo}.csv`,
      ['Caregiver', 'Total Hrs', 'REG Hrs', 'OT Hrs', 'Holiday Hrs', 'Weekend Hrs',
       'REG Pay', 'OT Pay', 'Holiday Pay', 'Weekend Pay', 'Miles', 'Mileage Pay $', 'Total Pay'],
      payrollByCaregiver.map((r) => [
        r.name, r.hours.toFixed(2),
        r.regHours.toFixed(2), r.otHours.toFixed(2), r.holidayHours.toFixed(2), r.weekendHours.toFixed(2),
        r.regPay.toFixed(2), r.otPay.toFixed(2), r.holidayPay.toFixed(2), r.weekendPay.toFixed(2),
        r.mileageMiles.toFixed(1), r.mileagePayAmount.toFixed(2), r.pay.toFixed(2),
      ])
    )
  }

  const exportBillingCsv = () => {
    downloadCsv(
      `client-billing-${dateFrom}-${dateTo}.csv`,
      ['Client', 'Billable Hrs', 'Hours Bill $', 'Mileage Mi', 'Mileage Bill $', 'Total Bill $'],
      billingByClient.map((r) => [
        r.name, r.hours.toFixed(2), r.hoursBill.toFixed(2),
        r.mileageMiles.toFixed(1), r.mileageBill.toFixed(2), r.bill.toFixed(2),
      ])
    )
  }

  return (
    <div className="space-y-6">
      <Link
        href="/pages/agency/reports"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payroll &amp; Billing Report</h1>
        <p className="text-gray-600 mt-1">
          Hours breakdown per caregiver and client with pay and bill amounts. Includes approved visits and pending Time
          &amp; Billing rows (not yet approved).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{summary.totalHours.toFixed(2)}</div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Hours</div>
              <div className="text-sm text-gray-600 mt-0.5">
                {summary.visitCount} visits
                {summary.pendingVisitCount > 0
                  ? ` (${summary.pendingVisitCount} pending)`
                  : ''}
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{money(summary.totalPay)}</div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Payroll</div>
              <div className="text-sm text-gray-600 mt-0.5">{summary.caregiverCount} caregivers</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-violet-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-50 p-2 text-violet-600">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{money(summary.totalBill)}</div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Billing</div>
              <div className="text-sm text-gray-600 mt-0.5">{summary.clientCount} clients</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date range filter</div>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <button
              type="button"
              onClick={() => reload()}
              disabled={isPending}
              className="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
        <div className="w-full sm:w-80">
          <label className="block text-xs text-gray-500 mb-1">Search report</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Client, caregiver, service type"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900"
            />
          </div>
        </div>
        {/* <button
          type="button"
          onClick={() => setRateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" />
          Manage Rates
        </button> */}
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100/80 p-1">
        {(
          [
            ['detail', 'Detail Report'],
            ['payroll', 'Payroll Summary'],
            ['billing', 'Client Billing'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {tab === 'detail' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Payroll &amp; Billing Detail</h2>
              <p className="text-sm text-gray-500">
                Approved and pending visits — {formatRangeLabel(dateFrom, dateTo)}
              </p>
            </div>
            <button
              type="button"
              onClick={exportDetailCsv}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1600px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Client</th>
                  <th className="text-left px-3 py-2 font-semibold">Caregiver</th>
                  <th className="text-left px-3 py-2 font-semibold">Service</th>
                  <th className="text-left px-3 py-2 font-semibold">Date</th>
                  <th className="text-left px-3 py-2 font-semibold">Time</th>
                  <th className="text-right px-3 py-2 font-semibold">REG Hrs</th>
                  <th className="text-right px-3 py-2 font-semibold">OT Hrs</th>
                  <th className="text-right px-3 py-2 font-semibold">Hol Hrs</th>
                  <th className="text-right px-3 py-2 font-semibold">Wknd Hrs</th>
                  <th className="text-right px-3 py-2 font-semibold">REG Pay</th>
                  <th className="text-right px-3 py-2 font-semibold">OT Pay</th>
                  <th className="text-right px-3 py-2 font-semibold">Hol Pay</th>
                  <th className="text-right px-3 py-2 font-semibold">Wknd Pay</th>
                  <th className="text-right px-3 py-2 font-semibold">Miles</th>
                  <th className="text-right px-3 py-2 font-semibold">Pay Mile $</th>
                  <th className="text-right px-3 py-2 font-semibold text-emerald-700">Total Pay</th>
                  <th className="text-right px-3 py-2 font-semibold">Bill Rate</th>
                  <th className="text-right px-3 py-2 font-semibold">Bill Mile $</th>
                  <th className="text-right px-3 py-2 font-semibold text-violet-700">Total Bill</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-3 text-gray-900">{r.clientName}</td>
                    <td className="px-3 py-3 text-gray-900">{r.caregiverName}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${serviceBadgeClass(r.serviceTypeLabel)}`}>
                        {r.serviceTypeLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{r.visitDate}</td>
                    <td className="px-3 py-3 text-gray-700">{r.startTime}–{r.endTime}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{(r.regHours ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-orange-600">{(r.otHours ?? 0) > 0 ? (r.otHours ?? 0).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-600">{(r.holidayHours ?? 0) > 0 ? (r.holidayHours ?? 0).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-600">{(r.weekendHours ?? 0) > 0 ? (r.weekendHours ?? 0).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.regPay ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-orange-600">{(r.otPay ?? 0) > 0 ? money(r.otPay ?? 0) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-600">{(r.holidayPay ?? 0) > 0 ? money(r.holidayPay ?? 0) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-600">{(r.weekendPay ?? 0) > 0 ? money(r.weekendPay ?? 0) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{(r.mileageMiles ?? 0) > 0 ? `${(r.mileageMiles ?? 0).toFixed(1)} mi` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{(r.mileagePayAmount ?? 0) > 0 ? money(r.mileagePayAmount ?? 0) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700 tabular-nums">{money(r.payAmount)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(r.billRate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{(r.mileageBillAmount ?? 0) > 0 ? money(r.mileageBillAmount ?? 0) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-violet-700 tabular-nums">{money(r.billAmount)}</td>
                    <td className="px-3 py-3">
                      {r.billingState === 'pending' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 border border-amber-200">
                          Pending
                        </span>
                      ) : r.billingState === 'voided' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 border border-gray-200">
                          Voided
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                          ✓ Approved
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="px-3 py-10 text-center text-gray-500">
                      No approved or pending visits in this date range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Payroll Summary by Caregiver</h2>
              <p className="text-sm text-gray-500">{formatRangeLabel(dateFrom, dateTo)}</p>
            </div>
            <button
              type="button"
              onClick={exportPayrollCsv}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Caregiver</th>
                <th className="text-right px-4 py-3 font-semibold">REG Hrs</th>
                <th className="text-right px-4 py-3 font-semibold">OT Hrs</th>
                <th className="text-right px-4 py-3 font-semibold">Hol Hrs</th>
                <th className="text-right px-4 py-3 font-semibold">Wknd Hrs</th>
                <th className="text-right px-4 py-3 font-semibold">REG Pay</th>
                <th className="text-right px-4 py-3 font-semibold">OT Pay</th>
                <th className="text-right px-4 py-3 font-semibold">Hol Pay</th>
                <th className="text-right px-4 py-3 font-semibold">Wknd Pay</th>
                <th className="text-right px-4 py-3 font-semibold">Miles</th>
                <th className="text-right px-4 py-3 font-semibold">Mile Pay $</th>
                <th className="text-right px-4 py-3 font-semibold text-emerald-700">Total Pay</th>
              </tr>
            </thead>
            <tbody>
              {payrollByCaregiver.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                        {initials(r.name)}
                      </div>
                      <span className="font-semibold text-gray-900">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.regHours.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-orange-600">{r.otHours > 0 ? r.otHours.toFixed(2) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-600">{r.holidayHours > 0 ? r.holidayHours.toFixed(2) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-600">{r.weekendHours > 0 ? r.weekendHours.toFixed(2) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(r.regPay)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-orange-600">{r.otPay > 0 ? money(r.otPay) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-600">{r.holidayPay > 0 ? money(r.holidayPay) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-600">{r.weekendPay > 0 ? money(r.weekendPay) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">{r.mileageMiles > 0 ? `${r.mileageMiles.toFixed(1)} mi` : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.mileagePayAmount > 0 ? money(r.mileagePayAmount) : '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">{money(r.pay)}</td>
                </tr>
              ))}
              {payrollByCaregiver.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-gray-500">
                    No data for this range.
                  </td>
                </tr>
              ) : (
                <tr className="border-t border-emerald-100 bg-emerald-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-900">TOTALS · {summary.caregiverCount} caregivers</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{payrollByCaregiver.reduce((s,r)=>s+r.regHours,0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-orange-600">{payrollByCaregiver.reduce((s,r)=>s+r.otHours,0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-600">{payrollByCaregiver.reduce((s,r)=>s+r.holidayHours,0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-600">{payrollByCaregiver.reduce((s,r)=>s+r.weekendHours,0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(payrollByCaregiver.reduce((s,r)=>s+r.regPay,0))}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-orange-600">{money(payrollByCaregiver.reduce((s,r)=>s+r.otPay,0))}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-600">{money(payrollByCaregiver.reduce((s,r)=>s+r.holidayPay,0))}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-600">{money(payrollByCaregiver.reduce((s,r)=>s+r.weekendPay,0))}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-500">{payrollByCaregiver.reduce((s,r)=>s+r.mileageMiles,0).toFixed(1)} mi</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(payrollByCaregiver.reduce((s,r)=>s+r.mileagePayAmount,0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">{money(summary.totalPay)}</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          {payrollByCaregiver.length > 0 ? (
            <div className="border-t border-gray-100 px-4 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Hours Distribution</h3>
              <div className="space-y-2">
                {payrollByCaregiver.map((r) => (
                  <div key={`pay-dist-${r.id}`} className="grid grid-cols-[minmax(110px,180px)_1fr_90px_36px] items-center gap-3 text-xs">
                    <div className="truncate text-gray-600">{r.name}</div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(2, pct(r.hours, summary.totalHours))}%` }}
                      />
                    </div>
                    <div className="text-right tabular-nums text-gray-500">{r.hours.toFixed(2)} hrs</div>
                    <div className="text-right tabular-nums text-gray-400">{pct(r.hours, summary.totalHours)}%</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="border-t border-gray-100 p-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
              <span className="font-semibold">System Rules:</span> Only Approved visits appear in payroll and billing reports. Visits are never deleted — use status Voided to exclude a visit. Pay and bill
               rates are snapshotted on each visit record so historical records remain accurate when rates change.
            </div>
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Client Billing Summary</h2>
              <p className="text-sm text-gray-500">{formatRangeLabel(dateFrom, dateTo)}</p>
            </div>
            <button
              type="button"
              onClick={exportBillingCsv}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Client</th>
                <th className="text-right px-4 py-3 font-semibold">Billable Hrs</th>
                <th className="text-right px-4 py-3 font-semibold">Hours Bill</th>
                <th className="text-right px-4 py-3 font-semibold">Mileage Mi</th>
                <th className="text-right px-4 py-3 font-semibold">Mileage Bill $</th>
                <th className="text-right px-4 py-3 font-semibold text-violet-700">Total Bill</th>
              </tr>
            </thead>
            <tbody>
              {billingByClient.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-800">
                        {initials(r.name)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{r.name}</div>
                        <div className="text-xs text-gray-500">Bill rate: {money(r.billRate)}/hr</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-gray-700 tabular-nums">{r.hours.toFixed(2)} hrs</td>
                  <td className="px-4 py-4 text-right tabular-nums">{money(r.hoursBill)}</td>
                  <td className="px-4 py-4 text-right tabular-nums text-gray-500">{r.mileageMiles > 0 ? `${r.mileageMiles.toFixed(1)} mi` : '—'}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{r.mileageBill > 0 ? money(r.mileageBill) : '—'}</td>
                  <td className="px-4 py-4 text-right font-bold text-violet-700 tabular-nums">{money(r.bill)}</td>
                </tr>
              ))}
              {billingByClient.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    No data for this range.
                  </td>
                </tr>
              ) : (
                <tr className="border-t border-violet-100 bg-violet-50/50">
                  <td className="px-4 py-3 font-semibold text-gray-900">TOTALS · {summary.clientCount} clients</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    {billingByClient.reduce((acc, row) => acc + row.hours, 0).toFixed(2)} hrs
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(billingByClient.reduce((s,r)=>s+r.hoursBill,0))}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-500">{billingByClient.reduce((s,r)=>s+r.mileageMiles,0).toFixed(1)} mi</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(billingByClient.reduce((s,r)=>s+r.mileageBill,0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-violet-700 tabular-nums">{money(summary.totalBill)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {billingByClient.length > 0 ? (
            <div className="border-t border-gray-100 px-4 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Billing Distribution</h3>
              <div className="space-y-2">
                {billingByClient.map((r) => (
                  <div key={`bill-dist-${r.id}`} className="grid grid-cols-[minmax(110px,180px)_1fr_80px_36px] items-center gap-3 text-xs">
                    <div className="truncate text-gray-600">{r.name}</div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{ width: `${Math.max(2, pct(r.bill, summary.totalBill))}%` }}
                      />
                    </div>
                    <div className="text-right tabular-nums text-gray-500">{money(r.bill)}</div>
                    <div className="text-right tabular-nums text-gray-400">{pct(r.bill, summary.totalBill)}%</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="border-t border-gray-100 p-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
              <span className="font-semibold">System Rules:</span> Billing totals use the service contract rate
              effective on each visit date. Pending and approved visits are included; voided visits are excluded.
            </div>
          </div>
        </div>
      )}

      <RateManagerModal
        isOpen={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}

function RateManagerModal({
  isOpen,
  onClose,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const [subTab, setSubTab] = useState<'pay' | 'bill'>('pay')
  const [search, setSearch] = useState('')
  const [payRows, setPayRows] = useState<RateManagerPayRow[]>([])
  const [billRows, setBillRows] = useState<RateManagerBillRow[]>([])
  const [payDraft, setPayDraft] = useState<Record<string, string>>({})
  const [billDraft, setBillDraft] = useState<Record<string, string>>({})
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const load = useCallback((): Promise<void> => {
    setLoadErr(null)
    setActionErr(null)
    return (async () => {
      const res = await getRateManagerDataAction()
      if (res.error) {
        setLoadErr(res.error)
        return
      }
      setPayRows(res.payRows)
      setBillRows(res.billRows)
      setPayDraft(Object.fromEntries(res.payRows.map((r) => [r.id, String(r.rate)])))
      setBillDraft(Object.fromEntries(res.billRows.map((r) => [r.id, String(r.bill_rate ?? '')])))
    })()
  }, [])

  useEffect(() => {
    if (isOpen) void load()
  }, [isOpen, load])

  const payFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return payRows
    return payRows.filter((r) => r.caregiverName.toLowerCase().includes(q))
  }, [payRows, search])

  const billFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return billRows
    return billRows.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        (r.contract_name ?? '').toLowerCase().includes(q)
    )
  }, [billRows, search])

  const payDirty = useMemo(() => {
    for (const r of payRows) {
      const d = payDraft[r.id]
      if (d === undefined) continue
      if (Number(d) !== r.rate) return true
    }
    return false
  }, [payRows, payDraft])

  const billDirty = useMemo(() => {
    for (const r of billRows) {
      const d = billDraft[r.id]
      if (d === undefined) continue
      const cur = r.bill_rate ?? 0
      if (Number(d) !== cur) return true
    }
    return false
  }, [billRows, billDraft])

  const anyDirty = payDirty || billDirty

  const resetDrafts = () => {
    setPayDraft(Object.fromEntries(payRows.map((r) => [r.id, String(r.rate)])))
    setBillDraft(Object.fromEntries(billRows.map((r) => [r.id, String(r.bill_rate ?? '')])))
    setActionErr(null)
  }

  const save = () => {
    setActionErr(null)
    startTransition(async () => {
      for (const r of payRows) {
        const d = payDraft[r.id]
        if (d === undefined || Number(d) === r.rate) continue
        const res = await updateCaregiverPayRateFromManagerAction(r.caregiver_member_id, r.service_type, Number(d))
        if (res.error) {
          setActionErr(res.error)
          return
        }
      }
      for (const r of billRows) {
        const d = billDraft[r.id]
        if (d === undefined || Number(d) === (r.bill_rate ?? 0)) continue
        const res = await updatePatientServiceContractBillRateAction(r.id, Number(d))
        if (res.error) {
          setActionErr(res.error)
          return
        }
      }
      await load()
      onSaved?.()
      onClose()
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Pencil className="h-5 w-5 text-blue-600" />
          Rate Manager
        </span>
      }
      subtitle="View and update caregiver pay rates and client bill rates. Pay rate edits add a new effective-dated row and close the previous open row on the same date (see caregiver_pay_rates). Bill rate edits update the active contract row."
      size="xl"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search caregiver or client..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetDrafts}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !anyDirty}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
          <span className="font-semibold">Rate snapshot rule: </span>
          Caregiver pay uses versioned rates in the database. Saving a new pay amount starts a new effective period and
          ends the previous one on the same calendar date. Pending visits in Time &amp; Billing use the rate effective
          on the visit date.
        </div>

        <div className="flex justify-center">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setSubTab('pay')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${
                subTab === 'pay' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              <Users className="h-4 w-4" />
              Caregiver Pay Rates
            </button>
            <button
              type="button"
              onClick={() => setSubTab('bill')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${
                subTab === 'bill' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Client Bill Rates
            </button>
          </div>
        </div>

        {loadErr ? <p className="text-sm text-red-600">{loadErr}</p> : null}
        {actionErr ? <p className="text-sm text-red-600">{actionErr}</p> : null}

        {subTab === 'pay' && (
          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-gray-200">
            {payFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-500">
                <Users className="h-10 w-10 text-gray-300" />
                <p className="text-sm">No caregivers match your search.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Caregiver</th>
                    <th className="text-left px-3 py-2">Service</th>
                    <th className="text-right px-3 py-2">Rate</th>
                    <th className="text-left px-3 py-2">Unit</th>
                    <th className="text-left px-3 py-2">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {payFiltered.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{r.caregiverName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.service_type == null ? 'All types' : r.service_type}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={payDraft[r.id] ?? ''}
                          onChange={(e) => setPayDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-gray-900"
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-600">{r.unit_type}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{r.effective_start}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {subTab === 'bill' && (
          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-gray-200">
            {billFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-500">
                <Building2 className="h-10 w-10 text-gray-300" />
                <p className="text-sm">No clients match your search.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Client</th>
                    <th className="text-left px-3 py-2">Contract</th>
                    <th className="text-left px-3 py-2">Service</th>
                    <th className="text-right px-3 py-2">Bill rate</th>
                    <th className="text-left px-3 py-2">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {billFiltered.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{r.clientName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.contract_name ?? r.contract_type}</td>
                      <td className="px-3 py-2 text-gray-600">{r.service_type}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={billDraft[r.id] ?? ''}
                          onChange={(e) => setBillDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-gray-900"
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-600">{r.bill_unit_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">{anyDirty ? 'You have unsaved changes.' : 'No pending changes.'}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !anyDirty}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
