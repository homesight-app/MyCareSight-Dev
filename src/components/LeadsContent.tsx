'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, MoreVertical, Archive, List, LayoutGrid, ChevronUp, ChevronDown, ChevronsUpDown, Info, X } from 'lucide-react'
import AddLeadModal from './AddLeadModal'
import LeadsKanbanBoard from './LeadsKanbanBoard'
import LeadSignedModal from './LeadSignedModal'
import LeadCollectRetainerModal from './LeadCollectRetainerModal'
import { type LeadContext, LEAD_STAGES } from '@/lib/constants/lead-configs'
import { archiveLead, updateLeadStage } from '@/app/actions/leads'

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
  lead_owner?: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null
}

interface LeadsContentProps {
  leads: Lead[]
  context: LeadContext
  taskStatus?: Record<string, 'overdue' | 'today'>
}

export default function LeadsContent({ leads, context, taskStatus = {} }: LeadsContentProps) {
  const router = useRouter()
  type SortKey = 'name' | 'company' | 'service_type' | 'stage' | 'price' | 'signed_date' | 'source' | 'created_at'

  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('active')
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [modalOpen, setModalOpen] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [infoLeadId, setInfoLeadId] = useState<string | null>(null)
  const [signedModalLead, setSignedModalLead] = useState<Lead | null>(null)
  const [collectRetainerLeadId, setCollectRetainerLeadId] = useState<string | null>(null)
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const allSources = useMemo(() => {
    const set = new Set(leads.map(l => l.source).filter(Boolean) as string[])
    return [...set].sort()
  }, [leads])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const base = leads.filter(lead => {
      if (stageFilter === 'active' && ['on_hold', 'lost', 'signed'].includes(lead.stage)) return false
      if (stageFilter !== 'all' && stageFilter !== 'active' && lead.stage !== stageFilter) return false
      if (serviceTypeFilter !== 'all' && lead.service_type !== serviceTypeFilter) return false
      if (sourceFilter !== 'all' && (lead.source ?? '') !== sourceFilter) return false
      if (!term) return true
      const name = `${lead.contact_first_name ?? ''} ${lead.contact_last_name ?? ''}`.toLowerCase()
      const company = (lead.company_name ?? '').toLowerCase()
      const email = (lead.contact_email ?? '').toLowerCase()
      const phone = (lead.contact_phone ?? '').replace(/\D/g, '')
      const termDigits = term.replace(/\D/g, '')
      return name.includes(term) || company.includes(term) || email.includes(term) ||
        (termDigits.length >= 3 && phone.includes(termDigits))
    })

    return [...base].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'name':
          av = `${a.contact_first_name ?? ''} ${a.contact_last_name ?? ''}`.trim().toLowerCase()
          bv = `${b.contact_first_name ?? ''} ${b.contact_last_name ?? ''}`.trim().toLowerCase()
          break
        case 'company':
          av = (a.company_name ?? '').toLowerCase()
          bv = (b.company_name ?? '').toLowerCase()
          break
        case 'service_type':
          av = serviceTypeLabel(a.service_type).toLowerCase()
          bv = serviceTypeLabel(b.service_type).toLowerCase()
          break
        case 'stage':
          av = a.stage
          bv = b.stage
          break
        case 'price':
          av = a.price ?? -1
          bv = b.price ?? -1
          break
        case 'signed_date':
          av = a.signed_date ?? ''
          bv = b.signed_date ?? ''
          break
        case 'source':
          av = (a.source ?? '').toLowerCase()
          bv = (b.source ?? '').toLowerCase()
          break
        case 'created_at':
          av = a.created_at
          bv = b.created_at
          break
      }
      if (av === bv) return 0
      if (av === '' || av === -1) return 1
      if (bv === '' || bv === -1) return -1
      const cmp = av < bv ? -1 : 1
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [leads, search, stageFilter, serviceTypeFilter, sourceFilter, sortKey, sortDir])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length }
    counts.active = leads.filter(l =>
      !['on_hold', 'lost', 'signed'].includes(l.stage)
    ).length
    for (const s of LEAD_STAGES) {
      counts[s.key] = leads.filter(l => l.stage === s.key).length
    }
    return counts
  }, [leads])

  const handleArchive = async (e: React.MouseEvent, leadId: string) => {
    e.stopPropagation()
    setMenuOpenId(null)
    setArchivingId(leadId)
    await archiveLead(leadId)
    setArchivingId(null)
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
              onClick={() => setStageFilter('active')}
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
              onClick={() => setStageFilter('all')}
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
                onClick={() => setStageFilter(stage.key)}
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
            onChange={e => setServiceTypeFilter(e.target.value)}
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
              onChange={e => setSourceFilter(e.target.value)}
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
              onClick={() => { setServiceTypeFilter('all'); setSourceFilter('all') }}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Table — list mode only */}
        {viewMode === 'list' && <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {(['name', context.leadType === 'agency' ? 'company' : null, 'service_type', 'stage'] as const).filter(Boolean).map(col => {
                  const labels: Record<string, string> = { name: 'Name', company: 'Agency', service_type: 'Service Type', stage: 'Stage' }
                  const key = col as SortKey
                  const active = sortKey === key
                  return (
                    <th
                      key={key}
                      scope="col"
                      onClick={() => handleSort(key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        {labels[key]}
                        {active ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                      </span>
                    </th>
                  )
                })}
                {/* {context.billingVisible && (
                  <th
                    scope="col"
                    onClick={() => handleSort('price')}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      Price2
                      {sortKey === 'price' ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                    </span>
                  </th>
                )} */}
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
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={context.billingVisible ? (context.leadType === 'agency' ? 9 : 8) : (context.leadType === 'agency' ? 7 : 6)}
                    className="px-4 py-8 text-center text-gray-500 text-sm"
                  >
                    {search || (stageFilter !== 'all' && stageFilter !== 'active')
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
                    </td>
                    {/* {context.billingVisible && (
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatCurrency(lead.price)}
                      </td>
                    )} */}
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
                    <td className="px-4 py-3 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                      <div className="relative inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setInfoLeadId(lead.id) }}
                          className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          aria-label="More details"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === lead.id ? null : lead.id) }}
                          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {menuOpenId === lead.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-100 py-1">
                            <button
                              type="button"
                              disabled={archivingId === lead.id}
                              onClick={e => handleArchive(e, lead.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                              <Archive className="w-3.5 h-3.5" />
                              {archivingId === lead.id ? 'Archiving…' : 'Archive'}
                            </button>
                          </div>
                        )}
                      </div>
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

      {infoLeadId && (() => {
        const lead = filtered.find(l => l.id === infoLeadId)
        if (!lead) return null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setInfoLeadId(null)}>
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">{displayName(lead)}</h3>
                <button type="button" onClick={() => setInfoLeadId(null)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Added</dt>
                  <dd className="text-gray-900 font-medium">{formatDate(lead.created_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Price</dt>
                  <dd className="text-gray-900 font-medium">{formatCurrency(lead.price)}</dd>
                </div>
                {context.billingVisible && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Signed</dt>
                    <dd className="text-gray-900 font-medium">{formatDate(lead.signed_date)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )
      })()}

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
          onSuccess={() => { setSignedModalLead(null); router.refresh() }}
        />
      )}

      {collectRetainerLeadId && (
        <LeadCollectRetainerModal
          leadId={collectRetainerLeadId}
          open={true}
          onClose={() => setCollectRetainerLeadId(null)}
          onSuccess={() => { setCollectRetainerLeadId(null); router.refresh() }}
        />
      )}

    </>
  )
}
