'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Clock, FileText, CheckCircle2, AlertCircle,
  Circle, ChevronRight, Calendar, MapPin, Loader2,
  Check, X,
} from 'lucide-react'
import { acceptApplicationRequest, rejectProgramRequest } from '@/app/actions/applications'
import TablePagination from '@/components/ui/TablePagination'
import { formatDateShort } from '@/lib/format-date'

type ItemStatus = 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'

interface RequestedProgram {
  id: string
  application_name: string
  state: string
  status: string
  agency_id: string | null
  playbook_id: string | null
  created_at: string | null
  agencies: { id: string; name: string } | null
}

interface ActiveProgram {
  id: string
  application_name: string
  state: string
  status: string
  agency_id: string | null
  assigned_expert_id: string | null
  agencies: { id: string; name: string } | null
  application_playbook_items: { status: ItemStatus; requirement_type: string }[]
}

interface Props {
  requestedPrograms: RequestedProgram[]
  allPrograms: ActiveProgram[]
}

function computeProgress(items: { status: ItemStatus }[]) {
  const approved    = items.filter(i => i.status === 'approved').length
  const inProgress  = items.filter(i => i.status === 'in_progress').length
  const review      = items.filter(i => i.status === 'review_needed').length
  const notStarted  = items.filter(i => i.status === 'not_started').length
  const na          = items.filter(i => i.status === 'not_applicable').length
  const countable   = items.length - na
  const pct         = countable > 0 ? Math.round((approved / countable) * 100) : 0
  return { approved, inProgress, review, notStarted, pct }
}

const STATUS_BADGE: Record<string, string> = {
  requested:    'bg-blue-100 text-blue-700',
  in_progress:  'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved:     'bg-green-100 text-green-700',
  closed:       'bg-gray-100 text-gray-600',
}

function statusLabel(s: string) {
  return s.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}


export default function AdminProgramsContent({ requestedPrograms, allPrograms }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'requested' | 'all'>('requested')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [allPage, setAllPage] = useState(0)
  const ALL_PAGE_SIZE = 50

  useEffect(() => { setAllPage(0) }, [searchQuery, activeTab])

  const filter = <T extends { application_name: string; state: string; agencies: { name: string } | null }>(
    list: T[]
  ) => {
    if (!searchQuery) return list
    const q = searchQuery.toLowerCase()
    return list.filter(p =>
      p.application_name.toLowerCase().includes(q) ||
      p.state.toLowerCase().includes(q) ||
      (p.agencies?.name ?? '').toLowerCase().includes(q)
    )
  }

  const filteredRequested = filter(requestedPrograms)
  const filteredAll = filter(allPrograms)
  const pagedAll = useMemo(
    () => filteredAll.slice(allPage * ALL_PAGE_SIZE, (allPage + 1) * ALL_PAGE_SIZE),
    [filteredAll, allPage]
  )

  const handleApprove = async (programId: string) => {
    setLoadingId(programId)
    try {
      const { error } = await acceptApplicationRequest(programId)
      if (error) { alert(error); return }
      router.refresh()
    } finally {
      setLoadingId(null)
    }
  }

  const handleReject = async (programId: string) => {
    setLoadingId(programId + '-reject')
    try {
      const { error } = await rejectProgramRequest(programId)
      if (error) { alert(error); return }
      router.refresh()
    } catch {
      alert('Failed to reject. Please try again.')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search by program name, state, or agency..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('requested')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold transition-colors border-b-2 ${
            activeTab === 'requested'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Clock className="w-5 h-5" />
          Requested
          {requestedPrograms.length > 0 && (
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">
              {requestedPrograms.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold transition-colors border-b-2 ${
            activeTab === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-5 h-5" />
          All Programs
          {allPrograms.length > 0 && (
            <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs font-semibold">
              {allPrograms.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Requested Tab ── */}
      {activeTab === 'requested' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          {filteredRequested.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">No requested programs</p>
              <p className="text-sm text-gray-500">All program requests have been reviewed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequested.map(program => (
                <div key={program.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 bg-teal-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          {program.state.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-lg">{program.application_name}</h3>
                          <p className="text-sm text-gray-600 mt-0.5">{program.agencies?.name ?? '—'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 ml-16">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Submitted {formatDateShort(program.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {program.state}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleReject(program.id)}
                        disabled={loadingId !== null}
                        className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {loadingId === program.id + '-reject'
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <X className="w-4 h-4" />}
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(program.id)}
                        disabled={loadingId !== null}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {loadingId === program.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Check className="w-4 h-4" />}
                        Approve &amp; Launch
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── All Programs Tab ── */}
      {activeTab === 'all' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {filteredAll.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">No active programs yet</p>
              <p className="text-sm text-gray-500">Programs appear here once a request has been approved and launched.</p>
            </div>
          ) : (
            <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Agency</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Program</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">State</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedAll.map(program => {
                  const prog = computeProgress(program.application_playbook_items)
                  const badgeClass = STATUS_BADGE[program.status] ?? 'bg-gray-100 text-gray-600'
                  return (
                    <tr
                      key={program.id}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/pages/admin/programs/${program.id}`)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{program.agencies?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{program.application_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{`PRG-${program.id.substring(0, 8).toUpperCase()}`}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{program.state}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${prog.pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{prog.pct}%</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {prog.approved > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-green-600">
                              <CheckCircle2 className="w-3 h-3" /> {prog.approved}
                            </span>
                          )}
                          {prog.review > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-600">
                              <AlertCircle className="w-3 h-3" /> {prog.review}
                            </span>
                          )}
                          {prog.notStarted > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-gray-500">
                              <Circle className="w-3 h-3" /> {prog.notStarted}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
                          {statusLabel(program.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {program.application_playbook_items.length} items
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <TablePagination
              page={allPage}
              pageSize={ALL_PAGE_SIZE}
              totalCount={filteredAll.length}
              onPageChange={setAllPage}
              entityLabel="programs"
            />
            </>
          )}
        </div>
      )}
    </div>
  )
}
