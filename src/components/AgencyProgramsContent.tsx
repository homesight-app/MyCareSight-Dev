'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, AlertCircle, Circle, Search, ChevronRight, ChevronLeft, BookOpen, Eye, Loader2, X, ChevronDown } from 'lucide-react'
import ApplyForNewLicenseButton from './ApplyForNewLicenseButton'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import { cancelProgramRequest } from '@/app/actions/applications'

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

interface PendingRequest {
  id: string
  application_name: string
  state: string
  status: string
  created_at: string
}

interface AgencyProgramsContentProps {
  programs: Program[]
  totalCount: number
  page: number
  pageSize: number
  initialSearch?: string
  pendingRequests: PendingRequest[]
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
  pendingRequests,
}: AgencyProgramsContentProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [pendingExpanded, setPendingExpanded] = useState(false)

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
      if (search !== initialSearch) pushParams({ q: search, page: 0 })
    }, 400)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const handleCancel = async (requestId: string) => {
    setCancellingId(requestId)
    const { error } = await cancelProgramRequest(requestId)
    if (error) {
      alert(error)
    } else {
      router.refresh()
    }
    setCancellingId(null)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track your license application requirements and submit completed items for review.
          </p>
        </div>
        <div className="flex-shrink-0 w-48">
          <ApplyForNewLicenseButton programsOnly label="Request Program" />
        </div>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setPendingExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition-colors"
          >
            <h2 className="text-sm font-semibold text-amber-800">
              Pending Requests ({pendingRequests.length})
            </h2>
            <ChevronDown className={`w-4 h-4 text-amber-600 transition-transform duration-200 ${pendingExpanded ? 'rotate-180' : ''}`} />
          </button>
          {pendingExpanded && (
            <div className="px-4 pb-4 space-y-2">
              {pendingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{req.application_name}</p>
                    {req.state && <p className="text-xs text-gray-500">{req.state}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Awaiting review
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCancel(req.id)}
                      disabled={cancellingId !== null}
                      title="Cancel request"
                      className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {cancellingId === req.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <X className="w-3 h-3" />}
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-700 mb-1">
            {search ? 'No programs match your search.' : 'No active programs yet'}
          </p>
          {!search && (
            <p className="text-sm text-gray-500">
              Request a program above to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-10 px-2" />
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Application</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">State</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {programs.map(app => {
                const prog = computeProgress(app.application_playbook_items)
                return (
                  <tr
                    key={app.id}
                    onClick={() => router.push(`/pages/agency/programs/${app.id}`)}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                  >
                    <td className="w-10 px-2 py-3" onClick={e => e.stopPropagation()}>
                      <RecordActionsMenu
                        label={`Actions for ${app.application_name}`}
                        actions={[
                          { label: 'View Program', icon: Eye, href: `/pages/agency/programs/${app.id}` },
                        ]}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{app.application_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{app.state}</td>
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
                    <td className="px-4 py-3 text-sm text-gray-500">{app.application_playbook_items.length} items</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {totalCount > 0 && (
            <div className="px-6 py-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50">
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
