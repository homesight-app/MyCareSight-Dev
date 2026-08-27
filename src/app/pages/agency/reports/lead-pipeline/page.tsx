import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { assertAgencyReportsPageAccess } from '@/lib/agency-reports-access'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function LeadPipelineReportPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  assertAgencyReportsPageAccess(session!.profile)

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency/reports')

  const supabase = await createClient()

  const [stagesResult, leadsResult] = await Promise.all([
    q.getAgencyLeadStages(supabase, agencyId),
    supabase
      .from('leads')
      .select('stage')
      .eq('agency_id', agencyId)
      .eq('lead_type', 'patient')
      .eq('status', 'active'),
  ])

  const stages = stagesResult.data ?? []
  const leads = leadsResult.data ?? []

  // Count leads per stage
  const countsMap: Record<string, number> = {}
  for (const lead of leads) {
    countsMap[lead.stage] = (countsMap[lead.stage] ?? 0) + 1
  }

  const lostStages = stages.filter(s => s.is_lost)
  const activeStages = stages.filter(s => !s.is_lost)

  const pipelineTotal = activeStages.reduce((sum, s) => sum + (countsMap[s.key] ?? 0), 0)
  const lostTotal = lostStages.reduce((sum, s) => sum + (countsMap[s.key] ?? 0), 0)
  const grandTotal = pipelineTotal + lostTotal

  return (
    <div className="space-y-6">
      <Link
        href="/pages/agency/reports"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Reports
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Lead Pipeline Report</h1>
        <p className="text-gray-500 text-sm">Active patient leads by pipeline stage</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{grandTotal}</p>
          <p className="text-sm text-gray-500 mt-1">Total Leads</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{pipelineTotal}</p>
          <p className="text-sm text-gray-500 mt-1">In Pipeline</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-red-600">{lostTotal}</p>
          <p className="text-sm text-gray-500 mt-1">Lost</p>
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Pipeline Stages</h2>
        </div>
        {activeStages.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No stages configured.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Leads</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">% of Pipeline</th>
                <th className="px-5 py-3 pr-8 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Bar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeStages.map(stage => {
                const count = countsMap[stage.key] ?? 0
                const pct = pipelineTotal > 0 ? Math.round((count / pipelineTotal) * 100) : 0
                return (
                  <tr key={stage.key} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-900">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stage.color}`}>
                        {stage.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-900 text-right font-medium">{count}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 text-right">{pct}%</td>
                    <td className="px-5 py-3 pr-8">
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Lost stages */}
      {lostStages.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Lost / Closed</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Leads</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">% of All Leads</th>
                <th className="px-5 py-3 pr-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lostStages.map(stage => {
                const count = countsMap[stage.key] ?? 0
                const pct = grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0
                return (
                  <tr key={stage.key} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-900">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stage.color}`}>
                        {stage.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-900 text-right font-medium">{count}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 text-right">{pct}%</td>
                    <td className="px-5 py-3 pr-8" />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
