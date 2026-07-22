'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export interface SignedDeal {
  id: string
  name: string
  company: string | null
  serviceType: string | null
  price: number | null
  retainerAmount: number | null
  signedDate: string | null
}

export interface MonthlyPoint {
  month: string   // 'YYYY-MM'
  label: string   // 'Jun 2025'
  count: number
  value: number
}

export interface RevenueReportData {
  totalContractValue: number
  retainerCollected: number
  installmentRevenue: number
  projectedRemaining: number
  signedDeals: SignedDeal[]
  monthlyData: MonthlyPoint[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(val: string | null) {
  if (!val) return '—'
  try { return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

export default function AdminRevenueReport({ data }: { data: RevenueReportData }) {
  const [monthRange, setMonthRange] = useState<number>(12)

  const filteredMonthly = useMemo(() => {
    return data.monthlyData.slice(-monthRange)
  }, [data.monthlyData, monthRange])

  const maxValue = Math.max(...filteredMonthly.map(m => m.value), 1)

  const statCards = [
    { label: 'Total Contract Value', value: fmt(data.totalContractValue) },
    { label: 'Retainer Collected', value: fmt(data.retainerCollected) },
    { label: 'Installment Revenue', value: fmt(data.installmentRevenue) },
    { label: 'Projected Remaining', value: fmt(data.projectedRemaining) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/pages/admin/reports" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenue Tracker</h1>
          <p className="text-sm text-gray-500 mt-0.5">Signed contract value, retainer collected, and installment revenue</p>
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

      {/* Monthly chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Monthly Signed Deals</h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {[6, 12].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setMonthRange(n)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${monthRange === n ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {n}mo
              </button>
            ))}
          </div>
        </div>

        {filteredMonthly.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-gray-400">No signed deals in this period</div>
        ) : (
          <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
            {filteredMonthly.map(pt => (
              <div key={pt.month} className="flex flex-col items-center gap-1 min-w-[48px] flex-1">
                <span className="text-xs text-gray-500 font-medium">{pt.value > 0 ? fmt(pt.value) : ''}</span>
                <div className="w-full flex flex-col justify-end" style={{ height: '96px' }}>
                  <div
                    className="w-full rounded-t bg-emerald-500 transition-all min-h-[2px]"
                    style={{ height: `${Math.max(Math.round(pt.value / maxValue * 96), pt.value > 0 ? 4 : 0)}px` }}
                  />
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{pt.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signed deals table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Signed Deals ({data.signedDeals.length})</h2>
        </div>
        {data.signedDeals.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No signed deals yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Agency</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Retainer</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Signed Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.signedDeals.map(deal => (
                  <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{deal.name}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{deal.company || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{deal.serviceType || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-700 text-right">{deal.price != null ? fmt(deal.price) : '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 text-right">{deal.retainerAmount != null ? fmt(deal.retainerAmount) : '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 text-right">{fmtDate(deal.signedDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
