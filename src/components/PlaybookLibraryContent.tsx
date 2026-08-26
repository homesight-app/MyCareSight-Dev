'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Plus, X, Search, Eye } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createPlaybook, updatePlaybook } from '@/app/actions/playbooks'
import { US_STATES } from '@/lib/constants'
import { createPlaybookSchema, type CreatePlaybookFormData } from '@/lib/schemas/playbook'
import { showValidationToast } from '@/lib/form-validation-toast'
import { useTableState } from '@/hooks/useTableState'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import TablePagination from '@/components/ui/TablePagination'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'

type PlaybookRow = {
  id: string
  name: string
  playbook_type: string
  description: string | null
  is_active: boolean
  state: string | null
  cost_display: string | null
  processing_time_display: string | null
  renewal_period_display: string | null
  icon_type: string | null
  category_id: string | null
  subcategory_id: string | null
  created_at: string
  license_requirement: { id: string; state: string; license_type: string } | null
  category: { id: string; name: string } | null
  subcategory: { id: string; name: string } | null
  playbook_items: { count: number }[]
}

const TYPE_LABELS: Record<string, string> = {
  license_requirement: 'License Req',
  package: 'Package',
  onboarding: 'Onboarding',
  compliance: 'Compliance',
}

const TYPE_COLORS: Record<string, string> = {
  license_requirement: 'bg-blue-100 text-blue-700',
  package: 'bg-purple-100 text-purple-700',
  onboarding: 'bg-green-100 text-green-700',
  compliance: 'bg-amber-100 text-amber-700',
}

interface Props {
  playbooks: PlaybookRow[]
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[]
}

export default function PlaybookLibraryContent({ playbooks, categories }: Props) {
  const router = useRouter()
  const [localPlaybooks, setLocalPlaybooks] = useState(playbooks)
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedState, setSelectedState] = useState('All States')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => { setLocalPlaybooks(playbooks) }, [playbooks])

  const {
    search, setSearch,
    sort, setSort,
    page, setPage,
    pageSize,
    resetPage,
    applySortedData,
    applyPageSlice,
  } = useTableState({ defaultSort: { key: 'name', dir: 'asc' } })

  useEffect(() => { resetPage() }, [selectedCategoryFilter, selectedState, resetPage])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreatePlaybookFormData>({
    resolver: zodResolver(createPlaybookSchema),
    mode: 'onBlur',
    defaultValues: { type: 'license_requirement' },
  })

  const watchedCategoryId = watch('categoryId')

  const selectedCategorySubcategories = useMemo(
    () => categories.find(c => c.id === watchedCategoryId)?.subcategories ?? [],
    [categories, watchedCategoryId]
  )

  const allStates = useMemo(() => {
    const seen = new Set<string>()
    localPlaybooks.forEach(pb => {
      const s = pb.state ?? pb.license_requirement?.state
      if (s) seen.add(s)
    })
    return Array.from(seen).sort()
  }, [localPlaybooks])

  const filtered = useMemo(() => {
    return localPlaybooks.filter(pb => {
      const displayState = pb.state ?? pb.license_requirement?.state ?? ''
      if (selectedState !== 'All States' && displayState !== selectedState) return false
      if (selectedCategoryFilter && pb.category_id !== selectedCategoryFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          pb.name.toLowerCase().includes(q) ||
          displayState.toLowerCase().includes(q) ||
          (pb.description ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [localPlaybooks, search, selectedState, selectedCategoryFilter])

  const sortFn = useCallback(
    (key: string, dir: 'asc' | 'desc') => (a: PlaybookRow, b: PlaybookRow) => {
      const mul = dir === 'asc' ? 1 : -1
      if (key === 'name') return mul * a.name.localeCompare(b.name)
      if (key === 'type') return mul * a.playbook_type.localeCompare(b.playbook_type)
      if (key === 'state') {
        const sa = a.state ?? a.license_requirement?.state ?? ''
        const sb = b.state ?? b.license_requirement?.state ?? ''
        return mul * sa.localeCompare(sb)
      }
      return 0
    },
    []
  )

  const sorted = useMemo(() => applySortedData(filtered, sortFn), [filtered, applySortedData, sortFn])
  const { slice, totalCount } = useMemo(() => applyPageSlice(sorted), [sorted, applyPageSlice])

  const handleToggleActive = async (pb: PlaybookRow) => {
    const next = !pb.is_active
    setLocalPlaybooks(prev => prev.map(p => p.id === pb.id ? { ...p, is_active: next } : p))
    setTogglingId(pb.id)
    const { error } = await updatePlaybook(pb.id, { is_active: next })
    setTogglingId(null)
    if (error) {
      setLocalPlaybooks(prev => prev.map(p => p.id === pb.id ? { ...p, is_active: pb.is_active } : p))
    }
  }

  const onModalSubmit = async (data: CreatePlaybookFormData) => {
    setSubmitting(true)
    const { error, data: result } = await createPlaybook({
      name: data.name.trim(),
      playbook_type: data.type,
      state: data.state || null,
      description: data.description?.trim() || null,
      processing_time_display: data.processingTime?.trim() || null,
      cost_display: data.costDisplay?.trim() || null,
      service_fee_display: data.serviceFeeDisplay?.trim() || null,
      renewal_period_display: data.renewalPeriodDisplay?.trim() || null,
      icon_type: data.iconType || null,
      category_id: data.categoryId || null,
      subcategory_id: data.subcategoryId || null,
    })
    setSubmitting(false)
    if (error) { showValidationToast({ error }); return }
    setShowModal(false)
    reset()
    router.push(`/pages/admin/playbooks/${result!.id}`)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search, filter, and add button */}
      <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, state, or description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
            />
          </div>
          {categories.length > 0 && (
            <select
              value={selectedCategoryFilter}
              onChange={e => setSelectedCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <select
            value={selectedState}
            onChange={e => setSelectedState(e.target.value)}
            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white cursor-pointer"
          >
            <option>All States</option>
            {allStates.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Playbook
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          {localPlaybooks.length === 0 ? (
            <>
              <p className="text-sm font-medium text-gray-700 mb-1">No playbooks yet</p>
              <p className="text-sm text-gray-500">Create your first playbook to get started.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700 mb-1">No playbooks match your search</p>
              <p className="text-sm text-gray-500">Try adjusting your search or state filter.</p>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 text-xs text-gray-500 border-b border-gray-100">
            Showing {totalCount === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount} playbooks
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-10 px-2" />
                <SortableColumnHeader label="Name" sortKey="name" currentSort={sort} onSort={setSort} />
                <SortableColumnHeader label="Type" sortKey="type" currentSort={sort} onSort={setSort} />
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <SortableColumnHeader label="State" sortKey="state" currentSort={sort} onSort={setSort} />
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Processing</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {slice.map(pb => {
                const itemCount = pb.playbook_items?.[0]?.count ?? 0
                const displayState = pb.state ?? pb.license_requirement?.state ?? '—'
                return (
                  <tr
                    key={pb.id}
                    onClick={() => router.push(`/pages/admin/playbooks/${pb.id}`)}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                  >
                    <td className="w-10 px-2 py-3" onClick={e => e.stopPropagation()}>
                      <RecordActionsMenu
                        label={`Actions for ${pb.name}`}
                        actions={[
                          { label: 'View Detail', icon: Eye, href: `/pages/admin/playbooks/${pb.id}` },
                          {
                            label: pb.is_active ? 'Deactivate' : 'Activate',
                            onClick: () => handleToggleActive(pb),
                            destructive: pb.is_active,
                          },
                        ]}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{pb.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{`PB-${pb.id.substring(0, 8).toUpperCase()}`}</p>
                      {pb.description && <p className="text-xs text-gray-400 truncate max-w-xs">{pb.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[pb.playbook_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABELS[pb.playbook_type] ?? pb.playbook_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pb.category ? (
                        <span className="text-xs">
                          {pb.category.name}
                          {pb.subcategory && <span className="text-gray-400"> / {pb.subcategory.name}</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{displayState}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pb.cost_display ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pb.processing_time_display ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{itemCount}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pb.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {togglingId === pb.id ? '…' : pb.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} entityLabel="playbooks" />
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">New Playbook</h2>
              <button type="button" onClick={() => { setShowModal(false); reset() }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form noValidate onSubmit={handleSubmit(onModalSubmit)} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type <span className="text-red-500">*</span></label>
                  <select
                    {...register('type')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="license_requirement">License Requirement</option>
                    <option value="package">Package</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="compliance">Compliance</option>
                  </select>
                </div>

                {/* Category */}
                {categories.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        {...register('categoryId', { onChange: () => setValue('subcategoryId', '') })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— None —</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                      <select
                        {...register('subcategoryId')}
                        disabled={!watchedCategoryId || selectedCategorySubcategories.length === 0}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        <option value="">— None —</option>
                        {selectedCategorySubcategories.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input
                    {...register('name')}
                    type="text"
                    placeholder="e.g. Home Health Agency License"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    {...register('description')}
                    placeholder="Brief description of this playbook"
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* State */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <select
                    {...register('state')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">National (All States)</option>
                    {US_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Processing Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Processing Time</label>
                  <input
                    {...register('processingTime')}
                    type="text"
                    placeholder="e.g. 60 days"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Application Fee */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Application Fee</label>
                  <input
                    {...register('costDisplay')}
                    type="text"
                    placeholder="e.g. $500"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Service Fee */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Fee</label>
                  <input
                    {...register('serviceFeeDisplay')}
                    type="text"
                    placeholder="e.g. $350"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Cost of helping the owner submit their license</p>
                </div>

                {/* Renewal Period */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Period</label>
                  <input
                    {...register('renewalPeriodDisplay')}
                    type="text"
                    placeholder="e.g. 1 year"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Icon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <select
                    {...register('iconType')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— None —</option>
                    <option value="heart">Heart (Home Care)</option>
                    <option value="users">Users (Agency)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); reset() }}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create Playbook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
