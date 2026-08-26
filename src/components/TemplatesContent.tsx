'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Globe, Building2 } from 'lucide-react'
import { TEMPLATE_CATEGORIES, TEMPLATE_TYPES } from '@/lib/constants/template-variables'
import { toggleTemplateActive, deleteTemplate, duplicateTemplate } from '@/app/actions/templates'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import TablePagination from '@/components/ui/TablePagination'
import { useTableState } from '@/hooks/useTableState'

interface Template {
  id: string
  name: string
  type: string
  category: string
  description: string | null
  subject: string | null
  variables_used: string[] | null
  is_global: boolean
  agency_id: string | null
  is_active: boolean
  created_at: string
  agency: { id: string; name: string }[] | null
}

interface TemplatesContentProps {
  templates: Template[]
  isAdmin: boolean
  agencyId?: string
  basePath: string
}

const categoryLabel = (key: string) =>
  TEMPLATE_CATEGORIES.find(c => c.key === key)?.label ?? key

const typeColors: Record<string, string> = {
  document: 'bg-purple-100 text-purple-700',
  email:    'bg-teal-100 text-teal-700',
}

const categoryColors: Record<string, string> = {
  invoice:       'bg-amber-100 text-amber-700',
  contract:      'bg-blue-100 text-blue-700',
  hr:            'bg-pink-100 text-pink-700',
  communication: 'bg-green-100 text-green-700',
  onboarding:    'bg-indigo-100 text-indigo-700',
  other:         'bg-gray-100 text-gray-600',
}

export default function TemplatesContent({ templates, isAdmin, agencyId, basePath }: TemplatesContentProps) {
  const router = useRouter()
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)

  const { search, setSearch, sort, setSort, page, setPage, pageSize, applySortedData, applyPageSlice, resetPage } = useTableState({})

  useEffect(() => { resetPage() }, [typeFilter, resetPage])

  const counts = useMemo(() => ({
    all: templates.length,
    document: templates.filter(t => t.type === 'document').length,
    email: templates.filter(t => t.type === 'email').length,
  }), [templates])

  const canEdit = (t: Template) => {
    if (isAdmin) return true
    return !t.is_global && t.agency_id === agencyId
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return templates.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (!term) return true
      return t.name.toLowerCase().includes(term)
    })
  }, [templates, search, typeFilter])

  const sortFn = useCallback((key: string, dir: 'asc' | 'desc') => (a: Template, b: Template): number => {
    let cmp = 0
    if (key === 'name') cmp = a.name.localeCompare(b.name)
    else if (key === 'type') cmp = a.type.localeCompare(b.type)
    return dir === 'asc' ? cmp : -cmp
  }, [])

  const sorted = useMemo(() => applySortedData(filtered, sortFn), [filtered, applySortedData, sortFn])
  const { slice: rows, totalCount } = useMemo(() => applyPageSlice(sorted), [sorted, applyPageSlice])

  const handleToggleActive = useCallback(async (t: Template) => {
    setTogglingId(t.id)
    await toggleTemplateActive(t.id, !t.is_active)
    setTogglingId(null)
    router.refresh()
  }, [router])

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    await deleteTemplate(id)
    setDeletingId(null)
    router.refresh()
  }, [router])

  const handleCopy = useCallback(async (id: string) => {
    if (!agencyId) return
    setCopyingId(id)
    const result = await duplicateTemplate(id, agencyId)
    setCopyingId(null)
    if (!result.error && result.templateId) {
      router.push(`${basePath}/${result.templateId}`)
    } else {
      router.refresh()
    }
  }, [agencyId, basePath, router])

  const formatDate = (val: string) => {
    try { return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return '—' }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 sm:px-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900"></h2>
        <button
          type="button"
          onClick={() => router.push(`${basePath}/new`)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Type tabs */}
      <div className="px-4 sm:px-6 pt-3 pb-0 border-b border-gray-100 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {(['all', 'document', 'email'] as const).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap capitalize ${
                typeFilter === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {key === 'all' ? 'All' : TEMPLATE_TYPES.find(t => t.key === key)?.label ?? key}
              <span className={`ml-1.5 text-xs ${typeFilter === key ? 'text-blue-600' : 'text-gray-400'}`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 sm:px-6 py-3 border-b border-gray-100">
        <div className="relative sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="w-10 px-2 py-2.5" />
              <SortableColumnHeader label="Name" sortKey="name" currentSort={sort} onSort={setSort} />
              <SortableColumnHeader label="Type" sortKey="type" currentSort={sort} onSort={setSort} />
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</th>
              {isAdmin && (
                <th className="hidden lg:table-cell px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Agency</th>
              )}
              <th className="hidden xl:table-cell px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-gray-500 text-sm">
                  {search || typeFilter !== 'all'
                    ? 'No templates match your search or filter.'
                    : 'No templates yet. Click "New Template" to create one.'}
                </td>
              </tr>
            ) : rows.map(t => (
              <tr
                key={t.id}
                onClick={() => canEdit(t) ? router.push(`${basePath}/${t.id}`) : undefined}
                className={`hover:bg-gray-50/50 transition-colors ${canEdit(t) ? 'cursor-pointer' : ''}`}
              >
                <td className="w-10 px-2 py-3" onClick={e => e.stopPropagation()}>
                  <RecordActionsMenu
                    label={`Actions for ${t.name}`}
                    actions={canEdit(t) ? [
                      { label: 'Edit', href: `${basePath}/${t.id}` },
                      {
                        label: t.is_active ? 'Deactivate' : 'Activate',
                        onClick: () => handleToggleActive(t),
                        hidden: togglingId === t.id,
                        destructive: t.is_active,
                      },
                      {
                        label: 'Delete',
                        onClick: () => handleDelete(t.id),
                        hidden: deletingId === t.id,
                        destructive: true,
                      },
                    ] : agencyId ? [
                      {
                        label: copyingId === t.id ? 'Copying…' : 'Copy to My Templates',
                        onClick: () => handleCopy(t.id),
                        hidden: copyingId === t.id,
                      },
                    ] : []}
                  />
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {t.name}
                  {t.description && (
                    <div className="text-xs text-gray-400 font-normal truncate max-w-xs">{t.description}</div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[t.type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {t.type}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[t.category] ?? 'bg-gray-100 text-gray-600'}`}>
                    {categoryLabel(t.category)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {t.is_global ? (
                    <span className="inline-flex items-center gap-1 text-xs text-indigo-700 font-medium">
                      <Globe className="w-3 h-3" /> Global
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Building2 className="w-3 h-3" /> Agency
                    </span>
                  )}
                </td>
                {isAdmin && (
                  <td className="hidden lg:table-cell px-4 py-3 text-sm text-gray-500 max-w-[140px] truncate">
                    {Array.isArray(t.agency) && t.agency.length > 0
                      ? t.agency[0].name
                      : '—'}
                  </td>
                )}
                <td className="hidden xl:table-cell px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                  {formatDate(t.created_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        entityLabel="templates"
      />
    </div>
  )
}
