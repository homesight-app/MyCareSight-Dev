'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, MoreVertical, Archive, List, LayoutGrid } from 'lucide-react'
import AddLeadModal from './AddLeadModal'
import LeadsKanbanBoard from './LeadsKanbanBoard'
import { type LeadContext, LEAD_STAGES } from '@/lib/constants/lead-configs'
import { archiveLead } from '@/app/actions/leads'

interface Lead {
  id: string
  lead_type: string
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  company_name: string | null
  service_type: string | null
  stage: string
  source: string | null
  price: number | null
  signed_date: string | null
  status: string
  created_at: string
}

interface LeadsContentProps {
  leads: Lead[]
  context: LeadContext
}

export default function LeadsContent({ leads, context }: LeadsContentProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return leads.filter(lead => {
      if (stageFilter !== 'all' && lead.stage !== stageFilter) return false
      if (!term) return true
      const name = `${lead.contact_first_name ?? ''} ${lead.contact_last_name ?? ''}`.toLowerCase()
      const company = (lead.company_name ?? '').toLowerCase()
      const email = (lead.contact_email ?? '').toLowerCase()
      return name.includes(term) || company.includes(term) || email.includes(term)
    })
  }, [leads, search, stageFilter])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length }
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

        {/* Search */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-100">
          <div className="relative sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or company…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Table — list mode only */}
        {viewMode === 'list' && <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                {context.leadType === 'agency' && (
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Company</th>
                )}
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service Type</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Stage</th>
                {context.billingVisible && (
                  <>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Price</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Signed</th>
                  </>
                )}
                <th scope="col" className="hidden xl:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Source</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Added</th>
                <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={context.billingVisible ? (context.leadType === 'agency' ? 9 : 8) : (context.leadType === 'agency' ? 7 : 6)}
                    className="px-4 py-8 text-center text-gray-500 text-sm"
                  >
                    {search || stageFilter !== 'all'
                      ? 'No leads match your search or filter.'
                      : 'No leads yet. Click "Add Lead" to create one.'}
                  </td>
                </tr>
              ) : (
                filtered.map(lead => (
                  <tr
                    key={lead.id}
                    onClick={() => handleRowClick(lead.id)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {displayName(lead)}
                      {lead.contact_email && (
                        <div className="text-xs text-gray-400 font-normal">{lead.contact_email}</div>
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stageColorMap[lead.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                        {stageLabelMap[lead.stage] ?? lead.stage}
                      </span>
                    </td>
                    {context.billingVisible && (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatCurrency(lead.price)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {formatDate(lead.signed_date)}
                        </td>
                      </>
                    )}
                    <td className="hidden xl:table-cell px-4 py-3 whitespace-nowrap">
                      {lead.source && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {lead.source}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(lead.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                      <div className="relative inline-block">
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

      <AddLeadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); router.refresh() }}
        context={context}
      />
    </>
  )
}
