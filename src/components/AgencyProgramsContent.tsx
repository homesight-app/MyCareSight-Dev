'use client'

import { useState, useEffect, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, AlertCircle, Circle, Eye, Loader2, X, ChevronDown } from 'lucide-react'
import ApplyForNewLicenseButton from '@/components/ApplyForNewLicenseButton'
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'
import Button from '@/components/ui/PrimaryButton'
import { useAgencyBranchOptions } from '@/hooks/useAgencyBranchOptions'
import { cancelProgramRequest } from '@/app/actions/applications'
import { toast } from 'sonner'

type Status = 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'
interface PlaybookItem { status: Status; requirement_type: string }
interface Program {
  progress_summary?: { approved: number; inProgress: number; reviewNeeded: number; notStarted: number; notApplicable: number; itemCount: number }
  id: string
  application_name: string
  state: string
  status: string
  application_playbook_items: PlaybookItem[]
}
interface PendingRequest { id: string; application_name: string; state: string; status: string; created_at: string }
interface AgencyProgramsContentProps {
  branchSelectionEnabled?: boolean
  branchesEnabled?: boolean
  branchFilter?: string
  programs: Program[]
  totalCount: number
  page: number
  pageSize: number
  initialSearch?: string
  pendingHasMore?: boolean
  pendingRequests: PendingRequest[]
  error?: string | null
}

function computeProgress(items: PlaybookItem[]) {
  const approved = items.filter(i => i.status === 'approved').length
  const inProgress = items.filter(i => i.status === 'in_progress').length
  const reviewNeeded = items.filter(i => i.status === 'review_needed').length
  const notStarted = items.filter(i => i.status === 'not_started').length
  const notApplicable = items.filter(i => i.status === 'not_applicable').length
  const countable = items.length - notApplicable
  const pct = countable > 0 ? Math.round((approved / countable) * 100) : 0
  return { approved, inProgress, reviewNeeded, notStarted, pct }
}

function Progress({ program }: { program: Program }) {
  const summary = program.progress_summary
  const countable = summary ? summary.itemCount - summary.notApplicable : 0
  const prog = summary ? { ...summary, pct: countable > 0 ? Math.round(summary.approved / countable * 100) : 0 } : computeProgress(program.application_playbook_items)
  return <>
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-brand rounded-full" style={{ width: `${prog.pct}%` }} /></div>
      <span className="text-xs text-gray-500">{prog.pct}%</span>
    </div>
    <div className="flex items-center gap-2 mt-1 flex-wrap">
      {prog.approved > 0 && <span className="flex items-center gap-0.5 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" /> {prog.approved}</span>}
      {prog.reviewNeeded > 0 && <span className="flex items-center gap-0.5 text-xs text-amber-600"><AlertCircle className="w-3 h-3" /> {prog.reviewNeeded} needs attention</span>}
      {prog.inProgress > 0 && <span className="flex items-center gap-0.5 text-xs text-blue-600"><Clock className="w-3 h-3" /> {prog.inProgress} in review</span>}
      {prog.notStarted > 0 && <span className="flex items-center gap-0.5 text-xs text-gray-500"><Circle className="w-3 h-3" /> {prog.notStarted} not started</span>}
    </div>
  </>
}

export default function AgencyProgramsContent({ programs, totalCount, page, pageSize, initialSearch = '',
  branchSelectionEnabled = false, branchesEnabled = false, branchFilter = '', pendingRequests, pendingHasMore = false, error = null,
}: AgencyProgramsContentProps) {
  const router = useRouter()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [pendingExpanded, setPendingExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const branchOptions = useAgencyBranchOptions(branchesEnabled)
  const serverQuery = useMemo(() => ({ page, q: initialSearch, branch: branchFilter }), [page, initialSearch, branchFilter])
  const serverKey = JSON.stringify(serverQuery)
  const lastServerKey = useRef(serverKey)
  const lastNavigation = useRef<string | null>(null)
  const [query, setQuery] = useState(serverQuery)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const blocked = isPending || cancellingId !== null

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(query.q), 400)
    return () => clearTimeout(timer)
  }, [query.q])
  // One navigation for the table's filter/search change plus page-reset callbacks.
  useEffect(() => {
    if (lastServerKey.current !== serverKey) {
      lastServerKey.current = serverKey
      lastNavigation.current = null
      setQuery(serverQuery)
      setDebouncedSearch(serverQuery.q)
      return
    }
    if (query.q !== debouncedSearch || JSON.stringify(query) === serverKey) return
    const params = new URLSearchParams(window.location.search)
    ;['page', 'q', 'branch'].forEach(key => params.delete(key))
    if (query.page > 0) params.set('page', String(query.page))
    if (query.q.trim()) params.set('q', query.q.trim())
    if (branchesEnabled && query.branch) params.set('branch', query.branch)
    const destination = `?${params.toString()}`
    if (lastNavigation.current === destination) return
    lastNavigation.current = destination
    startTransition(() => router.push(destination, { scroll: false }))
  }, [serverKey, serverQuery, query, debouncedSearch, branchesEnabled, router])
  const changeQuery = (values: Partial<typeof query>) => setQuery(current => ({ ...current, ...values }))
  const refresh = () => startTransition(() => router.refresh())
  const handleCancel = async (requestId: string) => {
    if (blocked) return
    setCancellingId(requestId)
    try {
      const { error: cancellationError } = await cancelProgramRequest(requestId)
      if (cancellationError) toast.error(cancellationError)
      else refresh()
    } catch { toast.error('Unable to cancel the service request. Please try again.') }
    finally { setCancellingId(null) }
  }
  const columns: DataTableColumn<Program>[] = [
    { key: 'name', label: 'Service / Engagement', render: program => program.application_name },
    { key: 'state', label: 'State', render: program => program.state, className: 'text-gray-500' },
    { key: 'progress', label: 'Progress', render: program => <Progress program={program} /> },
    { key: 'items', label: 'Items', render: program => `${program.progress_summary?.itemCount ?? program.application_playbook_items.length} items`, className: 'text-gray-500' },
  ]
  const choices = branchOptions.result?.success ? branchOptions.result.data : []
  const filters = branchesEnabled ? [{ key: 'branch', label: 'Filter services by branch', value: query.branch,
    options: [{ value: '', label: 'All branches' }, ...choices.map(branch => ({ value: branch.id, label: branch.name + (branch.status !== 'active' ? ' (inactive)' : '') })),
      ...(query.branch && !choices.some(branch => branch.id === query.branch) ? [{ value: query.branch, label: 'Selected branch' }] : [])],
    onChange: (branch: string) => changeQuery({ branch }) }] : []

  return <div className="w-full min-w-0">
    <div className="mb-6">
      <div><h1 className="text-2xl font-bold text-gray-900">My Services</h1>
        <p className="text-sm text-gray-500 mt-1">Track your HomeSights service engagements, requirements, and progress.</p></div>
    </div>
    {pendingRequests.length > 0 && <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <button type="button" aria-expanded={pendingExpanded} onClick={() => setPendingExpanded(value => !value)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition-colors">
        <h2 className="text-sm font-semibold text-amber-800">Pending Requests ({pendingRequests.length}{pendingHasMore ? '+' : ''})</h2>
        <ChevronDown className={`w-4 h-4 text-amber-600 transition-transform duration-200 ${pendingExpanded ? 'rotate-180' : ''}`} />
      </button>
      {pendingExpanded && <div className="px-4 pb-4 space-y-2">
        {pendingHasMore && <p>Showing the latest 50 requests. Use the paginated services list below for older requests.</p>}
        {pendingRequests.map(req => <div key={req.id} className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-4 py-2.5">
          <div><p className="text-sm font-medium text-gray-900">{req.application_name}</p>{req.state && <p className="text-xs text-gray-500">{req.state}</p>}</div>
          <div className="flex items-center gap-2"><span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Awaiting review</span>
            <button type="button" onClick={() => handleCancel(req.id)} disabled={blocked} title="Cancel request" aria-label="Cancel request"
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {cancellingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}Cancel
            </button>
          </div>
        </div>)}
      </div>}
    </div>}
    {branchesEnabled && branchOptions.loading && <p role="status" className="mb-3 text-sm text-gray-500">Loading branch choices…</p>}
    {branchesEnabled && !branchOptions.loading && branchOptions.result && !branchOptions.result.success &&
      <div role="alert" className="mb-3 text-sm text-danger">Unable to load branch choices. <Button type="button" variant="secondary" size="sm" onClick={branchOptions.retry}>Retry branch choices</Button></div>}
    <DataTable label="Services" entityLabel="services" rows={programs} columns={columns} getRowKey={program => program.id} getRowLabel={program => program.application_name}
      pagination={{ page, pageSize, totalCount, onPageChange: next => changeQuery({ page: next }) }}
      search={{ value: query.q, onChange: value => changeQuery({ q: value }), placeholder: 'Search services...' }} filters={filters}
      loading={isPending} disabled={blocked} error={error} onRefresh={refresh} onRetry={refresh}
      toolbarActions={<ApplyForNewLicenseButton programsOnly label="Request Service" branchSelectionEnabled={branchSelectionEnabled} />}
      emptyMessage={query.q ? 'No services match your search.' : query.branch ? 'No services match this branch.' : 'No active services yet. Request a service to get started.'}
      rowNavigation={{ columnKey: 'name', getLabel: program => `Open service ${program.application_name}`, onOpen: program => router.push(`/pages/agency/programs/${program.id}`) }}
      rowActions={program => [{ label: 'View Service', icon: Eye, href: `/pages/agency/programs/${program.id}` }]} />
  </div>
}
