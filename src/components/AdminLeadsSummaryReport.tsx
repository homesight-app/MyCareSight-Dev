'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export interface ServiceTypeRow {
  key: string
  label: string
  count: number
  value: number
  pct: number
}

export interface MonthlyLeadsPoint {
  month: string
  label: string
  count: number
}

export interface LeadsSummaryData {
  totalLeads: number
  won: number
  lost: number
  winRate: number
  activeLeads: number
  archivedLeads: number
  serviceTypeBreakdown: ServiceTypeRow[]
  monthlyNewLeads: MonthlyLeadsPoint[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const SERVICE_BAR_COLORS = [
  'bg-indigo-500', 'bg-blue-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500',
]

export default function AdminLeadsSummaryReport({ data }: { data: LeadsSummaryData }) {
  const maxMonthCount = Math.max(...data.monthlyNewLeads.map(m => m.count), 1)
  const maxServiceCount = Math.max(...data.serviceTypeBreakdown.map(s => s.count), 1)

  const statCards = [
    { label: 'Total Leads', value: data.totalLeads.toString() },
    { label: 'Won (Signed)', value: data.won.toString() },
    { label: 'Lost', value: data.lost.toString() },
    { label: 'Win Rate', value: `${data.winRate}%` },
  ]

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
          {data.serviceTypeBreakdown.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-sm text-gray-400">No data</div>
          ) : (
            <div className="space-y-3">
              {data.serviceTypeBreakdown.map((row, i) => (
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
              { label: 'Active', value: data.activeLeads, color: 'bg-green-500' },
              { label: 'Archived', value: data.archivedLeads, color: 'bg-gray-300' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{row.label}</span>
                  <span className="text-sm font-medium text-gray-800">{row.value}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${row.color} transition-all`}
                    style={{ width: data.totalLeads > 0 ? `${Math.round(row.value / data.totalLeads * 100)}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly new leads chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">New Leads per Month (Last 12 Months)</h2>
        {data.monthlyNewLeads.every(m => m.count === 0) ? (
          <div className="h-32 flex items-center justify-center text-sm text-gray-400">No leads created in this period</div>
        ) : (
          <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
            {data.monthlyNewLeads.map(pt => (
              <div key={pt.month} className="flex flex-col items-center gap-1 min-w-[48px] flex-1">
                {pt.count > 0 && (
                  <span className="text-xs text-gray-500 font-medium">{pt.count}</span>
                )}
                <div className="w-full flex flex-col justify-end" style={{ height: '96px' }}>
                  <div
                    className="w-full rounded-t bg-indigo-500 transition-all min-h-0"
                    style={{ height: `${Math.round(pt.count / maxMonthCount * 96)}px`, minHeight: pt.count > 0 ? '4px' : '0' }}
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
