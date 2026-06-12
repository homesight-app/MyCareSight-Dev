'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export interface StageRow {
  key: string
  label: string
  count: number
  value: number
  avgDealSize: number
  pct: number
}

export interface PipelineReportData {
  stages: StageRow[]
  totalLeads: number
  totalPipelineValue: number
  totalSignedValue: number
  winRate: number
}

const STAT_CARDS = (d: PipelineReportData) => [
  { label: 'Active Leads', value: d.totalLeads.toString() },
  { label: 'Total Pipeline', value: fmt(d.totalPipelineValue) },
  { label: 'Signed Value', value: fmt(d.totalSignedValue) },
  { label: 'Win Rate', value: `${d.winRate}%` },
]

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const STAGE_BAR_COLOR: Record<string, string> = {
  new: 'bg-gray-400',
  contacted: 'bg-blue-500',
  proposal_sent: 'bg-indigo-500',
  verbal: 'bg-yellow-400',
  probable: 'bg-orange-400',
  signed: 'bg-green-500',
  on_hold: 'bg-gray-300',
  lost: 'bg-red-400',
}

export default function AdminPipelineReport({ data }: { data: PipelineReportData }) {
  const maxCount = Math.max(...data.stages.map(s => s.count), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/pages/admin/reports" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Current distribution of leads across pipeline stages</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS(data).map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{card.label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Funnel table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Stage Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Stage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Distribution</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Count</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">%</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Pipeline Value</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Avg Deal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.stages.map(row => (
                <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-800">{row.label}</td>
                  <td className="px-5 py-3">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-full min-w-[80px]">
                      <div
                        className={`h-full rounded-full ${STAGE_BAR_COLOR[row.key] ?? 'bg-gray-400'} transition-all`}
                        style={{ width: `${Math.round(row.count / maxCount * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700 text-right font-medium">{row.count}</td>
                  <td className="px-5 py-3 text-sm text-gray-500 text-right">{row.pct}%</td>
                  <td className="px-5 py-3 text-sm text-gray-700 text-right">{row.value > 0 ? fmt(row.value) : '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-500 text-right">{row.avgDealSize > 0 ? fmt(row.avgDealSize) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td className="px-5 py-3 text-sm font-semibold text-gray-800">Total</td>
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-sm font-semibold text-gray-800 text-right">{data.totalLeads}</td>
                <td className="px-5 py-3 text-sm font-semibold text-gray-800 text-right">100%</td>
                <td className="px-5 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(data.totalPipelineValue)}</td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
