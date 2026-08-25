'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Plus, X, Search, Filter, Loader2, Eye } from 'lucide-react'
import { createPlaybook, updatePlaybook } from '@/app/actions/playbooks'
import { US_STATES } from '@/lib/constants'

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
  const [formError, setFormError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedState, setSelectedState] = useState('All States')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => { setLocalPlaybooks(playbooks) }, [playbooks])

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
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matches =
          pb.name.toLowerCase().includes(q) ||
          displayState.toLowerCase().includes(q) ||
          (pb.description ?? '').toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [localPlaybooks, searchQuery, selectedState, selectedCategoryFilter])

  const handleToggleActive = async (e: React.MouseEvent, pb: PlaybookRow) => {
    e.stopPropagation()
    const next = !pb.is_active
    setLocalPlaybooks(prev => prev.map(p => p.id === pb.id ? { ...p, is_active: next } : p))
    setTogglingId(pb.id)
    const { error } = await updatePlaybook(pb.id, { is_active: next })
    setTogglingId(null)
    if (error) {
      setLocalPlaybooks(prev => prev.map(p => p.id === pb.id ? { ...p, is_active: pb.is_active } : p))
    }
  }

  const [name, setName] = useState('')
  const [type, setType] = useState<'license_requirement' | 'package' | 'onboarding' | 'compliance'>('license_requirement')
  const [state, setState] = useState('')
  const [description, setDescription] = useState('')
  const [processingTime, setProcessingTime] = useState('')
  const [costDisplay, setCostDisplay] = useState('')
  const [serviceFeeDisplay, setServiceFeeDisplay] = useState('')
  const [renewalPeriodDisplay, setRenewalPeriodDisplay] = useState('')
  const [iconType, setIconType] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')

  const resetForm = () => {
    setName('')
    setType('license_requirement')
    setState('')
    setDescription('')
    setProcessingTime('')
    setCostDisplay('')
    setServiceFeeDisplay('')
    setRenewalPeriodDisplay('')
    setIconType('')
    setCategoryId('')
    setSubcategoryId('')
    setFormError(null)
  }

  const selectedCategorySubcategories = useMemo(
    () => categories.find(c => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId]
  )

  const handleSubmit = async () => {
    if (!name.trim()) { setFormError('Name is required'); return }
    setSubmitting(true)
    setFormError(null)
    const { error, data } = await createPlaybook({
      name: name.trim(),
      playbook_type: type,
      state: state || null,
      description: description.trim() || null,
      processing_time_display: processingTime.trim() || null,
      cost_display: costDisplay.trim() || null,
      service_fee_display: serviceFeeDisplay.trim() || null,
      renewal_period_display: renewalPeriodDisplay.trim() || null,
      icon_type: iconType || null,
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
    })
    setSubmitting(false)
    if (error) { setFormError(error); return }
    setShowModal(false)
    resetForm()
    router.push(`/pages/admin/playbooks/${data!.id}`)
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
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
            />
          </div>
          <button className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center">
            <Filter className="w-4 h-4 text-gray-600" />
          </button>
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
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">State</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cost</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Processing</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Items</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Active</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(pb => {
                const itemCount = pb.playbook_items?.[0]?.count ?? 0
                const displayState = pb.state ?? pb.license_requirement?.state ?? '—'
                return (
                  <tr
                    key={pb.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
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
                    <td className="px-4 py-3 text-gray-600">
                      {pb.category ? (
                        <span className="text-xs">
                          {pb.category.name}
                          {pb.subcategory && <span className="text-gray-400"> / {pb.subcategory.name}</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{displayState}</td>
                    <td className="px-4 py-3 text-gray-600">{pb.cost_display ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{pb.processing_time_display ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{itemCount}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={e => handleToggleActive(e, pb)}
                        disabled={togglingId === pb.id}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${pb.is_active ? 'bg-blue-600' : 'bg-gray-200'}`}
                        role="switch"
                        aria-checked={pb.is_active}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${pb.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                      <span className="ml-2 text-xs font-medium text-gray-600 inline-flex items-center gap-1">
                        {togglingId === pb.id && <Loader2 className="w-3 h-3 animate-spin" />}
                        {pb.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); setLoadingId(pb.id); router.push(`/pages/admin/playbooks/${pb.id}`) }}
                        disabled={loadingId === pb.id}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingId === pb.id ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Loading...</>
                        ) : (
                          <><Eye className="w-3 h-3" /> View Detail</>
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">New Playbook</h2>
              <button onClick={() => { setShowModal(false); resetForm() }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type <span className="text-red-500">*</span></label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as typeof type)}
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
                      value={categoryId}
                      onChange={e => { setCategoryId(e.target.value); setSubcategoryId('') }}
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
                      value={subcategoryId}
                      onChange={e => setSubcategoryId(e.target.value)}
                      disabled={!categoryId || selectedCategorySubcategories.length === 0}
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
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Home Health Agency License"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of this playbook"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* State */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <select
                  value={state}
                  onChange={e => setState(e.target.value)}
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
                  type="text"
                  value={processingTime}
                  onChange={e => setProcessingTime(e.target.value)}
                  placeholder="e.g. 60 days"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Application Fee */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Application Fee</label>
                <input
                  type="text"
                  value={costDisplay}
                  onChange={e => setCostDisplay(e.target.value)}
                  placeholder="e.g. $500"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Service Fee */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Fee</label>
                <input
                  type="text"
                  value={serviceFeeDisplay}
                  onChange={e => setServiceFeeDisplay(e.target.value)}
                  placeholder="e.g. $350"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Cost of helping the owner submit their license</p>
              </div>

              {/* Renewal Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Period</label>
                <input
                  type="text"
                  value={renewalPeriodDisplay}
                  onChange={e => setRenewalPeriodDisplay(e.target.value)}
                  placeholder="e.g. 1 year"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Icon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                <select
                  value={iconType}
                  onChange={e => setIconType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  <option value="heart">Heart (Home Care)</option>
                  <option value="users">Users (Agency)</option>
                </select>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => { setShowModal(false); resetForm() }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create Playbook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
