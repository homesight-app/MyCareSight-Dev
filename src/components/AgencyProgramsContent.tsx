'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Clock, AlertCircle, Circle, Search, ChevronRight, ChevronLeft } from 'lucide-react'

type Status = 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'

interface PlaybookItem {
  status: Status
  requirement_type: string
}

interface Program {
  id: string
  application_name: string
  state: string
  status: string
  application_playbook_items: PlaybookItem[]
}

interface AgencyProgramsContentProps {
  programs: Program[]
  totalCount: number
  page: number
  pageSize: number
  initialSearch?: string
}

function computeProgress(items: PlaybookItem[]) {
  const approved      = items.filter(i => i.status === 'approved').length
  const inProgress    = items.filter(i => i.status === 'in_progress').length
  const reviewNeeded  = items.filter(i => i.status === 'review_needed').length
  const notStarted    = items.filter(i => i.status === 'not_started').length
  const notApplicable = items.filter(i => i.status === 'not_applicable').length
  const countable = items.length - notApplicable
  const pct = countable > 0 ? Math.round((approved / countable) * 100) : 0
  return { approved, inProgress, reviewNeeded, notStarted, pct }
}

export default function AgencyProgramsContent({
  programs,
  totalCount,
  page,
  pageSize,
  initialSearch = '',
}: AgencyProgramsContentProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)

  const totalPages  = Math.max(1, Math.ceil(totalCount / pageSize))
  const displayFrom = totalCount === 0 ? 0 : page * pageSize + 1
  const displayTo   = Math.min((page + 1) * pageSize, totalCount)

  const pushParams = useCallback(
    (overrides: { page?: number; q?: string }) => {
      const p = new URLSearchParams()
      const newPage   = overrides.page ?? 0
      const newSearch = overrides.q !== undefined ? overrides.q : search
      if (newPage > 0)      p.set('page', String(newPage))
      if (newSearch.trim()) p.set('q', newSearch.trim())
      router.push(`?${p.toString()}`, { scroll: false })
    },
    [router, search]
  )

  useEffect(() => {
    const id = setTimeout(() => {
      if (search !== initialSearch) {
        pushParams({ q: search, page: 0 })
      }
    }, 400)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track your license application requirements and submit completed items for review.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by application name…"
          className="w-full sm:max-w-xs pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      {programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-medium text-gray-700 mb-1">
            {search ? 'No programs match your search.' : 'No active programs yet'}
          </p>
          {!search && (
            <p className="text-sm text-gray-500">
              Your license application requirements will appear here once they have been set up.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Application</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">State</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Progress</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Items</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {programs.map(app => {
                const prog = computeProgress(app.application_playbook_items)
                return (
                  <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{app.application_name}</td>
                    <td className="px-4 py-3 text-gray-500">{app.state}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${prog.pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{prog.pct}%</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {prog.approved > 0 && <span className="flex items-center gap-0.5 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" /> {prog.approved}</span>}
                        {prog.reviewNeeded > 0 && <span className="flex items-center gap-0.5 text-xs text-amber-600"><AlertCircle className="w-3 h-3" /> {prog.reviewNeeded} needs attention</span>}
                        {prog.inProgress > 0 && <span className="flex items-center gap-0.5 text-xs text-blue-600"><Clock className="w-3 h-3" /> {prog.inProgress} in review</span>}
                        {prog.notStarted > 0 && <span className="flex items-center gap-0.5 text-xs text-gray-500"><Circle className="w-3 h-3" /> {prog.notStarted} not started</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{app.application_playbook_items.length} items</td>
                    <td className="px-4 py-3">
                      <Link href={`/pages/agency/programs/${app.id}`} className="text-gray-400 hover:text-blue-600 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pagination footer */}
          {totalCount > 0 && (
            <div className="px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing <span className="font-medium">{displayFrom}–{displayTo}</span> of{' '}
                <span className="font-medium">{totalCount}</span> programs
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => pushParams({ page: page - 1 })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => pushParams({ page: page + 1 })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
