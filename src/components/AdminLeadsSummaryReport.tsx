'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { AGENCY_SERVICE_TYPES } from '@/lib/constants/lead-configs'

interface RawLead {
  stage: string
  status: string
  service_type: string | null
  price: number | null
  created_at: string
}

export interface ServiceTypeRow {
  key: string
  label: string
  count: number
  value: number
  pct: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const SERVICE_BAR_COLORS = [
  'bg-indigo-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500', 'bg-violet-500',
]

type Mode = 'month' | 'week' | 'custom'

function getMonthPeriod(offset: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
  const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return { start, end, label }
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
}

function getWeekPeriod(offset: number) {
  const now = new Date()
  const monday = getMondayOfWeek(now)
  const weekStart = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset * 7)
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6, 23, 59, 59, 999)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const label = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}, ${weekEnd.getFullYear()}`
  return { start: weekStart, end: weekEnd, label }
}

function getWeekBucketsForMonth(year: number, month: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const ranges: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, 28]]
  if (lastDay > 28) ranges.push([29, lastDay])
  return ranges.map(([s, e]) => ({
    start: new Date(year, month, s),
    end: new Date(year, month, e, 23, 59, 59, 999),
    label: `${s}–${e}`,
  }))
}

function getDayBucketsForWeek(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    return {
      start: d,
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
    }
  })
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

export default function AdminLeadsSummaryReport({ leads }: { leads: RawLead[] }) {
  const [mode, setMode] = useState<Mode>('month')
  const [offset, setOffset] = useState(0)
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [customEnd, setCustomEnd] = useState(todayStr)

  const period = useMemo(() => {
    if (mode === 'custom') {
      const start = customStart ? new Date(customStart + 'T00:00:00') : new Date(0)
      const end   = customEnd   ? new Date(customEnd   + 'T23:59:59') : new Date()
      const fmtD  = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      return { start, end, label: customStart && customEnd ? `${fmtD(start)} – ${fmtD(end)}` : 'Select a range' }
    }
    return mode === 'month' ? getMonthPeriod(offset) : getWeekPeriod(offset)
  }, [mode, offset, customStart, customEnd])

  const filteredLeads = useMemo(
    () => leads.filter(l => {
      const d = new Date(l.created_at)
      return d >= period.start && d <= period.end
    }),
    [leads, period]
  )

  const stats = useMemo(() => {
    const won = filteredLeads.filter(l => l.stage === 'signed').length
    const lost = filteredLeads.filter(l => l.stage === 'lost').length
    const winRate = won + lost > 0 ? Math.round(won / (won + lost) * 100) : 0
    const activeLeads = filteredLeads.filter(l => l.status === 'active').length
    const archivedLeads = filteredLeads.filter(l => l.status === 'archived').length
    const serviceTypeBreakdown: ServiceTypeRow[] = AGENCY_SERVICE_TYPES
      .map(st => {
        const stLeads = filteredLeads.filter(l => l.service_type === st.key)
        const count = stLeads.length
        const value = stLeads.reduce((sum, l) => sum + (l.price ?? 0), 0)
        return {
          key: st.key,
          label: st.label,
          count,
          value,
          pct: filteredLeads.length > 0 ? Math.round(count / filteredLeads.length * 100) : 0,
        }
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
    return { won, lost, winRate, activeLeads, archivedLeads, serviceTypeBreakdown }
  }, [filteredLeads])

  const barBuckets = useMemo(
    () => mode === 'month'
      ? getWeekBucketsForMonth(period.start.getFullYear(), period.start.getMonth())
      : getDayBucketsForWeek(period.start),
    [mode, period]
  )

  const barChartData = useMemo(
    () => barBuckets.map(b => ({
      label: b.label,
      count: filteredLeads.filter(l => {
        const d = new Date(l.created_at)
        return d >= b.start && d <= b.end
      }).length,
    })),
    [filteredLeads, barBuckets]
  )

  const maxBarCount = Math.max(...barChartData.map(b => b.count), 1)
  const maxServiceCount = Math.max(...stats.serviceTypeBreakdown.map(s => s.count), 1)

  const statCards = [
    { label: 'Total Leads', value: filteredLeads.length.toString() },
    { label: 'Won (Signed)', value: stats.won.toString() },
    { label: 'Lost', value: stats.lost.toString() },
    { label: 'Win Rate', value: `${stats.winRate}%` },
  ]

  const handleModeChange = (m: Mode) => {
    setMode(m)
    setOffset(0)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/pages/admin/reports" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads Summary</h1>
          <p className="text-sm text-gray-500 mt-0.5">Lead volume, service mix, and win/loss analysis</p>
        </div>
      </div>

      {/* Period picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {([
            ['month', 'By Month'],
            ['week',  'By Week'],
            ['custom','Custom'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={`px-4 py-1.5 font-medium transition-colors ${
                mode === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'custom' ? (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={customStart}
              max={customEnd || todayStr()}
              onChange={e => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={todayStr()}
              onChange={e => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOffset(o => o - 1)}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-800 min-w-[200px] text-center">
              {period.label}
            </span>
            <button
              type="button"
              onClick={() => setOffset(o => o + 1)}
              disabled={offset >= 0}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{card.label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Service type breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">By Service Type</h2>
          {stats.serviceTypeBreakdown.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-sm text-gray-400">No data</div>
          ) : (
            <div className="space-y-3">
              {stats.serviceTypeBreakdown.map((row, i) => (
                <div key={row.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{row.label}</span>
                    <div className="flex items-center gap-3 text-right">
                      <span className="text-sm font-medium text-gray-800">{row.count}</span>
                      {row.value > 0 && (
                        <span className="text-xs text-gray-500 w-24 text-right">{fmt(row.value)}</span>
                      )}
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${SERVICE_BAR_COLORS[i % SERVICE_BAR_COLORS.length]} transition-all`}
                      style={{ width: `${Math.round(row.count / maxServiceCount * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Lead Status</h2>
          <div className="space-y-4">
            {[
              { label: 'Active', value: stats.activeLeads, color: 'bg-green-500' },
              { label: 'Archived', value: stats.archivedLeads, color: 'bg-gray-300' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{row.label}</span>
                  <span className="text-sm font-medium text-gray-800">{row.value}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${row.color} transition-all`}
                    style={{ width: filteredLeads.length > 0 ? `${Math.round(row.value / filteredLeads.length * 100)}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          New Leads {mode === 'month' ? 'by Week' : 'by Day'}
        </h2>
        {barChartData.every(b => b.count === 0) ? (
          <div className="h-32 flex items-center justify-center text-sm text-gray-400">No leads in this period</div>
        ) : (
          <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
            {barChartData.map((pt, i) => (
              <div key={i} className="flex flex-col items-center gap-1 min-w-[48px] flex-1">
                {pt.count > 0 && (
                  <span className="text-xs text-gray-500 font-medium">{pt.count}</span>
                )}
                <div className="w-full flex flex-col justify-end" style={{ height: '96px' }}>
                  <div
                    className="w-full rounded-t bg-indigo-500 transition-all"
                    style={{ height: `${Math.round(pt.count / maxBarCount * 96)}px`, minHeight: pt.count > 0 ? '4px' : '0' }}
                  />
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{pt.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
