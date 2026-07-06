'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/Modal'
import { Search, Loader2 } from 'lucide-react'
import type { PlaybookItem, ValidationRule } from '@/lib/supabase/query/playbooks'
import type { OtherPlaybook, PlaybookItemWithPlaybook } from '@/app/actions/playbooks'
import {
  addPlaybookItem,
  setPlaybookItemRules,
  getPlaybookItems as fetchPlaybookItems,
  getOtherPlaybooksForCopy,
  getAllItemsForBrowse,
  copyPlaybookItems,
} from '@/app/actions/playbooks'

type Tab = 'new' | 'copy' | 'browse'
type ItemType = 'step' | 'document'
type Assignment = 'client' | 'expert' | 'both'
type RequirementType = 'required' | 'optional'

interface FormState {
  name: string
  description: string
  instructions: string
  estimated_days: string
  document_type: string
  phase: string
  assignment: Assignment
  requirement_type: RequirementType
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  instructions: '',
  estimated_days: '',
  document_type: '',
  phase: '',
  assignment: 'client',
  requirement_type: 'required',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  playbookId: string
  ruleLibrary: ValidationRule[]
  onItemAdded: (item: PlaybookItem) => void
  onItemsCopied: (items: PlaybookItem[]) => void
}

export default function AddPlaybookItemModal({ isOpen, onClose, playbookId, ruleLibrary, onItemAdded, onItemsCopied }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('new')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── New tab state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [activeTypeTab, setActiveTypeTab] = useState<ItemType>('step')
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([])

  // ── Copy tab state ───────────────────────────────────────────────────────────
  const [otherPlaybooks, setOtherPlaybooks] = useState<OtherPlaybook[]>([])
  const [copyPlaybooksLoaded, setCopyPlaybooksLoaded] = useState(false)
  const [copyPlaybooksLoading, setCopyPlaybooksLoading] = useState(false)
  const [selectedCopyPlaybookId, setSelectedCopyPlaybookId] = useState('')
  const [copyItems, setCopyItems] = useState<PlaybookItem[]>([])
  const [copyItemsLoading, setCopyItemsLoading] = useState(false)
  const [copySelectedIds, setCopySelectedIds] = useState<Set<string>>(new Set())

  // ── Browse tab state ─────────────────────────────────────────────────────────
  const [browseItems, setBrowseItems] = useState<PlaybookItemWithPlaybook[]>([])
  const [browseLoaded, setBrowseLoaded] = useState(false)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
  const [browseSelectedIds, setBrowseSelectedIds] = useState<Set<string>>(new Set())

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) return
    setActiveTab('new')
    setForm(EMPTY_FORM)
    setActiveTypeTab('step')
    setSelectedRuleIds([])
    setSelectedCopyPlaybookId('')
    setCopyItems([])
    setCopySelectedIds(new Set())
    setBrowseSearch('')
    setBrowseSelectedIds(new Set())
    setError(null)
  }, [isOpen])

  // Lazy-load: other playbooks when Copy tab first opens
  useEffect(() => {
    if (activeTab !== 'copy' || copyPlaybooksLoaded) return
    setCopyPlaybooksLoading(true)
    getOtherPlaybooksForCopy(playbookId).then(r => {
      if (!r.error) setOtherPlaybooks(r.playbooks)
      setCopyPlaybooksLoaded(true)
      setCopyPlaybooksLoading(false)
    })
  }, [activeTab, copyPlaybooksLoaded, playbookId])

  // Load items when a copy playbook is selected
  useEffect(() => {
    if (!selectedCopyPlaybookId) { setCopyItems([]); return }
    setCopyItemsLoading(true)
    setCopySelectedIds(new Set())
    fetchPlaybookItems(selectedCopyPlaybookId).then(r => {
      if (!r.error) setCopyItems(r.items)
      setCopyItemsLoading(false)
    })
  }, [selectedCopyPlaybookId])

  // Lazy-load: all items when Browse tab first opens
  useEffect(() => {
    if (activeTab !== 'browse' || browseLoaded) return
    setBrowseLoading(true)
    getAllItemsForBrowse(playbookId).then(r => {
      if (!r.error) setBrowseItems(r.items)
      setBrowseLoaded(true)
      setBrowseLoading(false)
    })
  }, [activeTab, browseLoaded, playbookId])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
  const textareaCls = inputCls + ' resize-none'

  const selectEl = <T extends string>(value: T, onChange: (v: T) => void, options: { value: T; label: string }[]) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className={inputCls + ' bg-white'}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  const handleTypeTabChange = (t: ItemType) => {
    setActiveTypeTab(t)
    setForm(f => ({ ...f }))
    if (t !== 'document') setSelectedRuleIds([])
  }

  const toggleRule = (id: string) =>
    setSelectedRuleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // ── New tab submit ───────────────────────────────────────────────────────────

  const handleNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    const payload = {
      item_type: activeTypeTab,
      name: form.name.trim(),
      description: form.description.trim() || null,
      instructions: form.instructions.trim() || null,
      estimated_days: form.estimated_days ? parseInt(form.estimated_days) : null,
      document_type: form.document_type.trim() || null,
      phase: form.phase.trim() || null,
      assignment: form.assignment,
      requirement_type: form.requirement_type,
    }

    const result = await addPlaybookItem(playbookId, payload)
    if (result.error) { setError(result.error); setIsSaving(false); return }

    if (result.item && activeTypeTab === 'document' && selectedRuleIds.length > 0) {
      await setPlaybookItemRules(result.item.id, selectedRuleIds)
    }

    if (result.item) onItemAdded(result.item as PlaybookItem)
    setIsSaving(false)
  }

  // ── Copy tab actions ─────────────────────────────────────────────────────────

  const toggleCopyItem = (id: string) =>
    setCopySelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleCopySubmit = async () => {
    if (copySelectedIds.size === 0) return
    setIsSaving(true)
    setError(null)
    const result = await copyPlaybookItems(playbookId, Array.from(copySelectedIds))
    if (result.error) { setError(result.error); setIsSaving(false); return }
    onItemsCopied(result.items)
    setIsSaving(false)
  }

  // ── Browse tab actions ───────────────────────────────────────────────────────

  const toggleBrowseItem = (id: string) =>
    setBrowseSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleBrowseSubmit = async () => {
    if (browseSelectedIds.size === 0) return
    setIsSaving(true)
    setError(null)
    const result = await copyPlaybookItems(playbookId, Array.from(browseSelectedIds))
    if (result.error) { setError(result.error); setIsSaving(false); return }
    onItemsCopied(result.items)
    setIsSaving(false)
  }

  const filteredBrowseItems = browseSearch.trim().length < 2
    ? browseItems
    : browseItems.filter(i => {
        const q = browseSearch.toLowerCase()
        return (
          i.name.toLowerCase().includes(q) ||
          (i.description ?? '').toLowerCase().includes(q) ||
          (i.playbook?.name ?? '').toLowerCase().includes(q) ||
          (i.playbook?.state ?? '').toLowerCase().includes(q) ||
          (i.playbook?.license_requirement?.license_type ?? '').toLowerCase().includes(q)
        )
      })

  const playbook_label = (item: PlaybookItemWithPlaybook) => {
    const p = item.playbook
    if (!p) return '—'
    const lr = p.license_requirement
    return lr ? `${lr.state} – ${lr.license_type}` : p.name
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string }[] = [
    { id: 'new', label: 'New' },
    { id: 'copy', label: 'Copy from Playbook' },
    { id: 'browse', label: 'Browse All' },
  ]

  const showRulePicker = activeTypeTab === 'document' && ruleLibrary.length > 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Item" size="xl">
      {/* Tab nav */}
      <div className="flex border-b border-gray-200 mb-5 -mt-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`py-2.5 px-5 border-b-2 font-medium text-sm transition-colors -mb-px ${
              activeTab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* ── New tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'new' && (
        <>
          {/* Item type selector */}
          <div className="flex border-b border-gray-200 mb-5">
            {(['step', 'document'] as ItemType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeTabChange(t)}
                className={`py-2 px-4 border-b-2 font-medium text-sm capitalize transition-colors -mb-px ${
                  activeTypeTab === t
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'step' ? 'Step' : 'Document'}
              </button>
            ))}
          </div>

          <form onSubmit={handleNewSubmit} className="space-y-4">
            {field('Name',
              <input
                className={inputCls}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={activeTypeTab === 'step' ? 'e.g., Client provides Certificate of Status' : 'e.g., Certificate of Insurance (COI)'}
                required
              />
            )}

            {field('Description',
              <textarea
                className={textareaCls}
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional details about this item"
              />
            )}

            {activeTypeTab === 'step' && (
              <>
                {field('Instructions',
                  <textarea
                    className={textareaCls}
                    rows={3}
                    value={form.instructions}
                    onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                    placeholder="Step-by-step guidance for completing this item"
                  />
                )}
                {field('Estimated Days',
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    value={form.estimated_days}
                    onChange={e => setForm(f => ({ ...f, estimated_days: e.target.value }))}
                    placeholder="e.g., 5"
                  />
                )}
              </>
            )}

            {activeTypeTab === 'document' && field('Document Type',
              <input
                className={inputCls}
                value={form.document_type}
                onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
                placeholder="e.g., Government ID, Certificate, License"
              />
            )}

            <div className="grid grid-cols-3 gap-3 pt-1">
              {field('Phase',
                <input
                  className={inputCls}
                  value={form.phase}
                  onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}
                  placeholder="e.g., Client Intake"
                />
              )}
              {field('Assignment', selectEl(form.assignment, v => setForm(f => ({ ...f, assignment: v })), [
                { value: 'client', label: 'Client' },
                { value: 'expert', label: 'Expert' },
                { value: 'both', label: 'Both' },
              ]))}
              {field('Requirement', selectEl(form.requirement_type, v => setForm(f => ({ ...f, requirement_type: v })), [
                { value: 'required', label: 'Required' },
                { value: 'optional', label: 'Optional' },
              ]))}
            </div>

            {showRulePicker && (
              <div className="pt-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Validation Rules
                  <span className="ml-1 text-xs font-normal text-gray-400">(expert checks these against the agency record when reviewing)</span>
                </label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {ruleLibrary.map(rule => {
                    const checked = selectedRuleIds.includes(rule.id)
                    return (
                      <label
                        key={rule.id}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRule(rule.id)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${checked ? 'text-blue-800' : 'text-gray-800'}`}>{rule.name}</p>
                          {rule.description && <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>}
                        </div>
                      </label>
                    )
                  })}
                </div>
                {selectedRuleIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1.5">{selectedRuleIds.length} rule{selectedRuleIds.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !form.name.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Add Item'}
              </button>
            </div>
          </form>
        </>
      )}

      {/* ── Copy from Playbook tab ────────────────────────────────────────────── */}
      {activeTab === 'copy' && (
        <div className="space-y-4">
          {copyPlaybooksLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading playbooks…
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Playbook</label>
                <select
                  value={selectedCopyPlaybookId}
                  onChange={e => setSelectedCopyPlaybookId(e.target.value)}
                  className={inputCls + ' bg-white'}
                >
                  <option value="">— Choose a playbook —</option>
                  {otherPlaybooks.map(p => {
                    const lr = p.license_requirement
                    const label = lr ? `${lr.state} – ${lr.license_type}` : p.name
                    return <option key={p.id} value={p.id}>{label}</option>
                  })}
                </select>
                {otherPlaybooks.length === 0 && !copyPlaybooksLoading && (
                  <p className="text-sm text-gray-500 mt-2">No other active playbooks found.</p>
                )}
              </div>

              {selectedCopyPlaybookId && (
                <>
                  {copyItemsLoading ? (
                    <div className="flex items-center justify-center py-8 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading items…
                    </div>
                  ) : copyItems.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">This playbook has no items yet.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">{copyItems.length} item{copyItems.length !== 1 ? 's' : ''} — select which to copy</p>
                        <button
                          type="button"
                          onClick={() => setCopySelectedIds(copySelectedIds.size === copyItems.length ? new Set() : new Set(copyItems.map(i => i.id)))}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {copySelectedIds.size === copyItems.length ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>

                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                        {copyItems.map(item => {
                          const checked = copySelectedIds.has(item.id)
                          return (
                            <label
                              key={item.id}
                              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCopyItem(item.id)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${item.item_type === 'step' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {item.item_type === 'step' ? 'Step' : 'Doc'}
                                  </span>
                                  <p className={`text-sm font-medium truncate ${checked ? 'text-blue-800' : 'text-gray-800'}`}>{item.name}</p>
                                </div>
                                {item.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>}
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${item.requirement_type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {item.requirement_type}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCopySubmit}
                  disabled={isSaving || copySelectedIds.size === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Copying…' : `Copy ${copySelectedIds.size > 0 ? copySelectedIds.size + ' ' : ''}Item${copySelectedIds.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Browse All tab ────────────────────────────────────────────────────── */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          {browseLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading all items…
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Search by name, description, playbook, state, or license type…"
                  value={browseSearch}
                  onChange={e => setBrowseSearch(e.target.value)}
                />
              </div>

              {browseItems.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No items found in other playbooks.</p>
              ) : filteredBrowseItems.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No items match your search.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">{filteredBrowseItems.length} item{filteredBrowseItems.length !== 1 ? 's' : ''} {browseSearch.trim().length >= 2 ? '(filtered)' : 'available'}</p>
                    {browseSelectedIds.size > 0 && (
                      <button type="button" onClick={() => setBrowseSelectedIds(new Set())} className="text-xs text-blue-600 hover:underline">
                        Clear selection ({browseSelectedIds.size})
                      </button>
                    )}
                  </div>

                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
                    {filteredBrowseItems.map(item => {
                      const checked = browseSelectedIds.has(item.id)
                      const pbLabel = playbook_label(item)
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBrowseItem(item.id)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${item.item_type === 'step' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                                {item.item_type === 'step' ? 'Step' : 'Doc'}
                              </span>
                              <p className={`text-sm font-medium truncate ${checked ? 'text-blue-800' : 'text-gray-800'}`}>{item.name}</p>
                            </div>
                            {item.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>}
                            <p className="text-xs text-gray-400 mt-0.5">{pbLabel}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${item.requirement_type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {item.requirement_type}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBrowseSubmit}
                  disabled={isSaving || browseSelectedIds.size === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Copying…' : `Copy ${browseSelectedIds.size > 0 ? browseSelectedIds.size + ' ' : ''}Item${browseSelectedIds.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
