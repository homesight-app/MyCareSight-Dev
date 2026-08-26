'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Archive, ArchiveRestore, List, LayoutGrid, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import AddLeadModal from './AddLeadModal'
import LeadsKanbanBoard from './LeadsKanbanBoard'
import LeadSignedModal from './LeadSignedModal'
import LeadCollectRetainerModal from './LeadCollectRetainerModal'
import ConvertToAgencyPromptModal from './ConvertToAgencyPromptModal'
import { type LeadContext, LEAD_STAGES } from '@/lib/constants/lead-configs'
import { archiveLead, unarchiveLead, updateLeadStage } from '@/app/actions/leads'

interface Lead {
  id: string
  lead_type: string
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  contact_phone: string | null
  company_name: string | null
  service_type: string | null
  stage: string
  retainer_amount: number | null
  service_states: string[] | null
  source: string | null
  price: number | null
  signed_date: string | null
  retainer_paid_date: string | null
  status: string
  created_at: string
  lead_owner_id: string | null
  proposal_sent_date: string | null
  converted_agency_id?: string | null
  lead_owner?: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null
}

interface LeadsContentProps {
  leads: Lead[]
  totalCount?: number
  page?: number
  pageSize?: number
  initialSearch?: string
  initialStageFilter?: string
  initialServiceType?: string
  initialSource?: string
  initialSortKey?: string
  initialSortDir?: 'asc' | 'desc'
  stageCounts?: Record<string, number>
  allSources?: string[]
  context: LeadContext
  taskStatus?: Record<string, 'overdue' | 'today'>
}

export default function LeadsContent({
  leads,
  totalCount = leads.length,
  page = 0,
  pageSize = leads.length || 50,
  initialSearch = '',
  initialStageFilter = 'active',
  initialServiceType = 'all',
  initialSource = 'all',
  initialSortKey = 'created_at',
  initialSortDir = 'desc',
  stageCounts: stageCountsProp,
  allSources: allSourcesProp,
  context,
  taskStatus = {},
}: LeadsContentProps) {
  const router = useRouter()
  type SortKey = 'name' | 'company' | 'service_type' | 'stage' | 'price' | 'signed_date' | 'source' | 'created_at'

  const [search, setSearch] = useState(initialSearch)
  const [stageFilter, setStageFilter] = useState<string>(initialStageFilter)
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>(initialServiceType)
  const [sourceFilter, setSourceFilter] = useState<string>(initialSource)
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey as SortKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir)
  const [modalOpen, setModalOpen] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null)
  const [signedModalLead, setSignedModalLead] = useState<Lead | null>(null)
  const [collectRetainerLeadId, setCollectRetainerLeadId] = useState<string | null>(null)
  const [convertPromptLead, setConvertPromptLead] = useState<Lead | null>(null)
  const [stageUpdatingId, setStageUpdatingId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (localStorage.getItem(`leads-view-${context.leadType}`) as 'list' | 'kanban') ?? 'list'
  })

  useEffect(() => {
    localStorage.setItem(`leads-view-${context.leadType}`, viewMode)
  }, [viewMode, context.leadType])

  const stageColorMap = useMemo(() =>
    Object.fromEntries(LEAD_STAGES.map(s => [s.key, s.color])),
    []
  )

  const stageLabelMap = useMemo(() =>
    Object.fromEntries(LEAD_STAGES.map(s => [s.key, s.label])),
    []
  )

  const serviceTypeLabel = (key: string | null) => {
    if (!key) return '—'
    return context.serviceTypes.find(s => s.key === key)?.label ?? key
  }

  // Pagination
  const totalPages  = Math.max(1, Math.ceil(totalCount / pageSize))
  const displayFrom = totalCount === 0 ? 0 : page * pageSize + 1
  const displayTo   = Math.min((page + 1) * pageSize, totalCount)

  const pushParams = useCallback(
    (overrides: {
      page?: number; q?: string; stage?: string; serviceType?: string
      source?: string; sortKey?: string; sortDir?: string
    }) => {
      const p = new URLSearchParams()
      const newPage        = overrides.page        ?? 0
      const newSearch      = overrides.q           !== undefined ? overrides.q           : search
      const newStage       = overrides.stage       !== undefined ? overrides.stage       : stageFilter
      const newServiceType = overrides.serviceType !== undefined ? overrides.serviceType : serviceTypeFilter
      const newSource      = overrides.source      !== undefined ? overrides.source      : sourceFilter
      const newSortKey     = overrides.sortKey     !== undefined ? overrides.sortKey     : sortKey
      const newSortDir     = overrides.sortDir     !== undefined ? overrides.sortDir     : sortDir
      if (newPage > 0)                    p.set('page',        String(newPage))
      if (newSearch.trim())               p.set('q',           newSearch.trim())
      if (newStage !== 'active')          p.set('stage',       newStage)
      if (newServiceType !== 'all')       p.set('serviceType', newServiceType)
      if (newSource !== 'all')            p.set('source',      newSource)
      if (newSortKey !== 'created_at')    p.set('sortKey',     newSortKey)
      if (newSortDir !== 'desc')          p.set('sortDir',     newSortDir)
      router.push(`?${p.toString()}`, { scroll: false })
    },
    [router, search, stageFilter, serviceTypeFilter, sourceFilter, sortKey, sortDir]
  )

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      if (search !== initialSearch) pushParams({ q: search, page: 0 })
    }, 400)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const handleSort = (key: SortKey) => {
    const newDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc'
    setSortKey(key)
    setSortDir(newDir)
    pushParams({ sortKey: key, sortDir: newDir, page: 0 })
  }

  // Use server-provided sources/counts when available; fall back to deriving from current page leads
  const allSources = useMemo(() => {
    if (allSourcesProp) return allSourcesProp
    const set = new Set(leads.map(l => l.source).filter(Boolean) as string[])
    return [...set].sort()
  }, [allSourcesProp, leads])

  // Server-driven leads are already filtered — render directly
  const filtered = leads

  const stageCounts = useMemo(() => {
    if (stageCountsProp) return stageCountsProp
    // Fallback: compute from current page (less accurate but backward-compatible)
    const nonArchived = leads.filter(l => l.status !== 'archived')
    const counts: Record<string, number> = { all: nonArchived.length }
    counts.active = nonArchived.filter(l => !['on_hold', 'lost', 'signed'].includes(l.stage)).length
    counts.archived = leads.filter(l => l.status === 'archived').length
    for (const s of LEAD_STAGES) {
      counts[s.key] = nonArchived.filter(l => l.stage === s.key).length
    }
    return counts
  }, [stageCountsProp, leads])

  const handleArchive = async (leadId: string) => {
    setArchivingId(leadId)
    await archiveLead(leadId)
    setArchivingId(null)
    router.refresh()
  }

  const handleUnarchive = async (leadId: string) => {
    setUnarchivingId(leadId)
    await unarchiveLead(leadId)
    setUnarchivingId(null)
    router.refresh()
  }

  const handleRowClick = (leadId: string) => {
    router.push(`${context.detailPath}/${leadId}`)
  }

  const formatDate = (val: string | null) => {
    if (!val) return '—'
    try {
      return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch { return '—' }
  }

  const formatCurrency = (val: number | null) => {
    if (val == null) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
  }

  const displayName = (lead: Lead) => {
    const first = lead.contact_first_name ?? ''
    const last = lead.contact_last_name ?? ''
    const full = `${first} ${last}`.trim()
    return full || '(No name)'
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 sm:px-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900"></h2>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                title="Kanban view"
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Lead
            </button>
          </div>
        </div>

        {/* Stage filter tabs — list mode only */}
        {viewMode === 'list' && <div className="px-4 sm:px-6 pt-3 pb-0 border-b border-gray-100 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max pb-0">
            <button
              type="button"
              onClick={() => { setStageFilter('active'); pushParams({ stage: 'active', page: 0 }) }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                stageFilter === 'active'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Active
              <span className={`ml-1.5 text-xs ${stageFilter === 'active' ? 'text-blue-600' : 'text-gray-400'}`}>
                {stageCounts.active}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setStageFilter('all'); pushParams({ stage: 'all', page: 0 }) }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                stageFilter === 'all'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All
              <span className={`ml-1.5 text-xs ${stageFilter === 'all' ? 'text-blue-600' : 'text-gray-400'}`}>
                {stageCounts.all}
              </span>
            </button>
            {LEAD_STAGES.map(stage => (
              <button
                key={stage.key}
                type="button"
                onClick={() => { setStageFilter(stage.key); pushParams({ stage: stage.key, page: 0 }) }}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  stageFilter === stage.key
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {stage.label}
                <span className={`ml-1.5 text-xs ${stageFilter === stage.key ? 'text-blue-600' : 'text-gray-400'}`}>
                  {stageCounts[stage.key] ?? 0}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setStageFilter('archived'); pushParams({ stage: 'archived', page: 0 }) }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                stageFilter === 'archived'
                  ? 'border-gray-500 text-gray-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Archived
              <span className={`ml-1.5 text-xs ${stageFilter === 'archived' ? 'text-gray-600' : 'text-gray-400'}`}>
                {stageCounts.archived ?? 0}
              </span>
            </button>
          </div>
        </div>}

        {/* Search + filters */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone or agency…"
              className="w-48 sm:w-56 pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <select
            value={serviceTypeFilter}
            onChange={e => { setServiceTypeFilter(e.target.value); pushParams({ serviceType: e.target.value, page: 0 }) }}
            className="py-1.5 pl-2 pr-7 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-gray-600"
          >
            <option value="all">All Service Types</option>
            {context.serviceTypes.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {allSources.length > 0 && (
            <select
              value={sourceFilter}
              onChange={e => { setSourceFilter(e.target.value); pushParams({ source: e.target.value, page: 0 }) }}
              className="py-1.5 pl-2 pr-7 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-gray-600"
            >
              <option value="all">All Sources</option>
              {allSources.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          {(serviceTypeFilter !== 'all' || sourceFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setServiceTypeFilter('all'); setSourceFilter('all'); pushParams({ serviceType: 'all', source: 'all', page: 0 }) }}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Table — list mode only */}
        {/* Pagination footer — list mode only */}
        {viewMode === 'list' && totalCount > 0 && (
          <div className="px-6 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium">{displayFrom}–{displayTo}</span> of{' '}
              <span className="font-medium">{totalCount}</span> leads
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => pushParams({ page: page - 1 })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => pushParams({ page: page + 1 })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {viewMode === 'list' && <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-2 py-3" />
                <th
                  scope="col"
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                >
                  <span className="flex items-center gap-1">
                    Name
                    {sortKey === 'name' ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                  </span>
                </th>
                {context.leadType === 'agency' && (
                  <th
                    scope="col"
                    onClick={() => handleSort('company')}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      Agency
                      {sortKey === 'company' ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                    </span>
                  </th>
                )}
                {(['service_type', 'stage'] as const).map(col => {
                  const labels: Record<string, string> = { service_type: 'Service Type', stage: 'Stage' }
                  const active = sortKey === col
                  return (
                    <th
                      key={col}
                      scope="col"
                      onClick={() => handleSort(col)}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        {labels[col]}
                        {active ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                      </span>
                    </th>
                  )
                })}
                <th
                  scope="col"
                  onClick={() => handleSort('price')}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                >
                  <span className="flex items-center gap-1">
                    Price
                    {sortKey === 'price' ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                  </span>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                  State
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('source')}
                  className="hidden xl:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                >
                  <span className="flex items-center gap-1">
                    Source
                    {sortKey === 'source' ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                  </span>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                  Owner
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                  Proposal Sent
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={context.billingVisible ? (context.leadType === 'agency' ? 10 : 9) : (context.leadType === 'agency' ? 8 : 7)}
                    className="px-4 py-8 text-center text-gray-500 text-sm"
                  >
                    {stageFilter === 'archived'
                      ? (search ? 'No archived leads match your search.' : 'No archived leads.')
                      : search || (stageFilter !== 'all' && stageFilter !== 'active')
                      ? 'No leads match your search or filter.'
                      : stageFilter === 'active'
                      ? 'No active leads. All leads are signed, on hold, or lost.'
                      : 'No leads yet. Click "Add Lead" to create one.'}
                  </td>
                </tr>
              ) : (
                filtered.map(lead => (
                  <tr
                    key={lead.id}
                    onClick={() => handleRowClick(lead.id)}
                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                      taskStatus[lead.id] === 'overdue' ? 'shadow-[inset_4px_0_0_#ef4444]' :
                      taskStatus[lead.id] === 'today'   ? 'shadow-[inset_4px_0_0_#facc15]' : ''
                    }`}
                  >
                    <td className="w-10 px-2 py-3" onClick={e => e.stopPropagation()}>
                      <RecordActionsMenu
                        label={`Actions for ${displayName(lead)}`}
                        actions={lead.status === 'archived' ? [
                          {
                            label: unarchivingId === lead.id ? 'Restoring…' : 'Unarchive',
                            onClick: () => handleUnarchive(lead.id),
                            hidden: unarchivingId === lead.id,
                          },
                        ] : [
                          {
                            label: archivingId === lead.id ? 'Archiving…' : 'Archive',
                            onClick: () => handleArchive(lead.id),
                            hidden: archivingId === lead.id,
                          },
                        ]}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {displayName(lead)}
                      {lead.contact_email && (
                        <div className="text-xs text-gray-400 font-normal">{lead.contact_email}</div>
                      )}
                      {lead.contact_phone && (
                        <div className="text-xs text-gray-400 font-normal">{lead.contact_phone}</div>
                      )}
                    </td>
                    {context.leadType === 'agency' && (
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {lead.company_name || '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {serviceTypeLabel(lead.service_type)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {lead.status === 'archived' ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stageColorMap[lead.stage] ?? 'bg-gray-100 text-gray-600'} opacity-60`}>
                          {stageLabelMap[lead.stage] ?? lead.stage}
                        </span>
                      ) : (
                        <div className={`relative inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${stageColorMap[lead.stage] ?? 'bg-gray-100 text-gray-600'} ${stageUpdatingId === lead.id ? 'opacity-50' : ''}`}>
                          {stageLabelMap[lead.stage] ?? lead.stage}
                          <ChevronDown className="w-3 h-3 opacity-60" />
                          <select
                            value={lead.stage}
                            disabled={stageUpdatingId === lead.id}
                            onChange={async e => {
                              const newStage = e.target.value
                              if (newStage === lead.stage) return
                              if (newStage === 'signed' || newStage === 'retainer') {
                                if (lead.stage === 'retainer' && newStage === 'signed') {
                                  setCollectRetainerLeadId(lead.id)
                                } else {
                                  setSignedModalLead(lead)
                                }
                              } else {
                                setStageUpdatingId(lead.id)
                                await updateLeadStage(lead.id, newStage)
                                setStageUpdatingId(null)
                                router.refresh()
                              }
                            }}
                            className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                          >
                            {LEAD_STAGES.map(s => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatCurrency(lead.price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {(() => {
                        const states = lead.service_states
                        if (!states || states.length === 0) return <span className="text-gray-400">—</span>
                        if (states.length === 1) return states[0]
                        return (
                          <span
                            title={states.slice().sort().join(', ')}
                            className="cursor-default underline decoration-dotted decoration-gray-400"
                          >
                            Multiple
                          </span>
                        )
                      })()}
                    </td>
                    <td className="hidden xl:table-cell px-4 py-3 whitespace-nowrap">
                      {lead.source && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {lead.source}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {(() => {
                        const o = Array.isArray(lead.lead_owner) ? lead.lead_owner[0] ?? null : lead.lead_owner
                        return o?.full_name?.trim() || '—'
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(lead.proposal_sent_date)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>}
      </div>

      {/* Kanban board — rendered outside the card container to allow full-width layout */}
      {viewMode === 'kanban' && (
        <div className="mt-4">
          <LeadsKanbanBoard leads={leads} context={context} search={search} />
        </div>
      )}

      <AddLeadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); router.refresh() }}
        context={context}
      />

      {signedModalLead && (
        <LeadSignedModal
          lead={signedModalLead}
          open={true}
          onClose={() => setSignedModalLead(null)}
          onSuccess={(stage) => {
            const lead = signedModalLead
            setSignedModalLead(null)
            if (stage === 'signed' && lead?.lead_type === 'agency' && !lead?.converted_agency_id) {
              setConvertPromptLead(lead)
            } else {
              router.refresh()
            }
          }}
        />
      )}

      {collectRetainerLeadId && (
        <LeadCollectRetainerModal
          leadId={collectRetainerLeadId}
          open={true}
          onClose={() => setCollectRetainerLeadId(null)}
          onSuccess={() => {
            const lead = leads.find((l: Lead) => l.id === collectRetainerLeadId) ?? null
            setCollectRetainerLeadId(null)
            if (lead?.lead_type === 'agency' && !lead?.converted_agency_id) {
              setConvertPromptLead(lead)
            } else {
              router.refresh()
            }
          }}
        />
      )}

      <ConvertToAgencyPromptModal
        open={!!convertPromptLead}
        lead={convertPromptLead ?? { id: '' }}
        onClose={() => { setConvertPromptLead(null); router.refresh() }}
      />

    </>
  )
}
