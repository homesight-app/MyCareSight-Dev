'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, MoreVertical, Copy, Pencil, Trash2, Globe, Building2 } from 'lucide-react'
import { TEMPLATE_CATEGORIES, TEMPLATE_TYPES } from '@/lib/constants/template-variables'
import { toggleTemplateActive, deleteTemplate, duplicateTemplate } from '@/app/actions/templates'

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
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return templates.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (!term) return true
      return t.name.toLowerCase().includes(term)
    })
  }, [templates, search, typeFilter])

  const counts = useMemo(() => ({
    all: templates.length,
    document: templates.filter(t => t.type === 'document').length,
    email: templates.filter(t => t.type === 'email').length,
  }), [templates])

  const canEdit = (t: Template) => {
    if (isAdmin) return true
    return !t.is_global && t.agency_id === agencyId
  }

  const handleToggleActive = async (e: React.MouseEvent, t: Template) => {
    e.stopPropagation()
    setMenuOpenId(null)
    setTogglingId(t.id)
    await toggleTemplateActive(t.id, !t.is_active)
    setTogglingId(null)
    router.refresh()
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setMenuOpenId(null)
    setDeletingId(id)
    await deleteTemplate(id)
    setDeletingId(null)
    router.refresh()
  }

  const handleCopy = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setMenuOpenId(null)
    if (!agencyId) return
    setCopyingId(id)
    const result = await duplicateTemplate(id, agencyId)
    setCopyingId(null)
    if (!result.error && result.templateId) {
      router.push(`${basePath}/${result.templateId}`)
    } else {
      router.refresh()
    }
  }

  const formatDate = (val: string) => {
    try { return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return '—' }
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
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
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Scope</th>
              {isAdmin && (
                <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Agency</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Active</th>
              <th className="hidden xl:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
              <th className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-gray-500 text-sm">
                  {search || typeFilter !== 'all'
                    ? 'No templates match your search or filter.'
                    : 'No templates yet. Click "New Template" to create one.'}
                </td>
              </tr>
            ) : filtered.map(t => (
              <tr
                key={t.id}
                onClick={() => canEdit(t) ? router.push(`${basePath}/${t.id}`) : undefined}
                className={`transition-colors ${canEdit(t) ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              >
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
                <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  {canEdit(t) ? (
                    <button
                      type="button"
                      disabled={togglingId === t.id}
                      onClick={e => handleToggleActive(e, t)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${t.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${t.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  ) : (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </td>
                <td className="hidden xl:table-cell px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                  {formatDate(t.created_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                  <div className="relative inline-block">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === t.id ? null : t.id) }}
                      className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {menuOpenId === t.id && (
                      <div className="absolute right-0 z-10 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-100 py-1">
                        {canEdit(t) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => { setMenuOpenId(null); router.push(`${basePath}/${t.id}`) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === t.id}
                              onClick={e => handleDelete(e, t.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {deletingId === t.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </>
                        ) : (
                          agencyId && (
                            <button
                              type="button"
                              disabled={copyingId === t.id}
                              onClick={e => handleCopy(e, t.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {copyingId === t.id ? 'Copying…' : 'Copy to My Templates'}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
