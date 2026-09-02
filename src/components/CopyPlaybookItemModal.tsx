'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/Modal'
import { Search, Loader2 } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import type { PlaybookItem } from '@/lib/supabase/query/playbooks'
import type { OtherPlaybook, PlaybookItemWithPlaybook } from '@/app/actions/playbooks'
import {
  getPlaybookItems as fetchPlaybookItems,
  getOtherPlaybooksForCopy,
  getAllItemsForBrowse,
  copyPlaybookItems,
} from '@/app/actions/playbooks'

type Tab = 'copy' | 'browse'

interface Props {
  isOpen: boolean
  onClose: () => void
  playbookId: string
  onItemsCopied: (items: PlaybookItem[]) => void
}

export default function CopyPlaybookItemModal({ isOpen, onClose, playbookId, onItemsCopied }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('copy')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!isOpen) return
    setActiveTab('copy')
    setSelectedCopyPlaybookId('')
    setCopyItems([])
    setCopySelectedIds(new Set())
    setCopyPlaybooksLoaded(false)
    setBrowseLoaded(false)
    setBrowseSearch('')
    setBrowseSelectedIds(new Set())
    setError(null)
  }, [isOpen])

  useEffect(() => {
    if (activeTab !== 'copy' || copyPlaybooksLoaded) return
    setCopyPlaybooksLoading(true)
    getOtherPlaybooksForCopy(playbookId).then(r => {
      if (!r.error) setOtherPlaybooks(r.playbooks)
      setCopyPlaybooksLoaded(true)
      setCopyPlaybooksLoading(false)
    })
  }, [activeTab, copyPlaybooksLoaded, playbookId])

  useEffect(() => {
    if (!selectedCopyPlaybookId) { setCopyItems([]); return }
    setCopyItemsLoading(true)
    setCopySelectedIds(new Set())
    fetchPlaybookItems(selectedCopyPlaybookId).then(r => {
      if (!r.error) setCopyItems(r.items)
      setCopyItemsLoading(false)
    })
  }, [selectedCopyPlaybookId])

  useEffect(() => {
    if (activeTab !== 'browse' || browseLoaded) return
    setBrowseLoading(true)
    getAllItemsForBrowse(playbookId).then(r => {
      if (!r.error) setBrowseItems(r.items)
      setBrowseLoaded(true)
      setBrowseLoading(false)
    })
  }, [activeTab, browseLoaded, playbookId])

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'

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

  const TABS: { id: Tab; label: string }[] = [
    { id: 'copy', label: 'Copy from Playbook' },
    { id: 'browse', label: 'Browse All' },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Copy Items" size="xl">
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

      {/* ── Copy from Playbook tab ──────────────────────────────────────────────── */}
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
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand flex-shrink-0"
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
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="button" onClick={handleCopySubmit} disabled={isSaving || copySelectedIds.size === 0} loading={isSaving}>
                  {`Copy ${copySelectedIds.size > 0 ? copySelectedIds.size + ' ' : ''}Item${copySelectedIds.size !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Browse All tab ──────────────────────────────────────────────────────── */}
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
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand flex-shrink-0"
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
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="button" onClick={handleBrowseSubmit} disabled={isSaving || browseSelectedIds.size === 0} loading={isSaving}>
                  {`Copy ${browseSelectedIds.size > 0 ? browseSelectedIds.size + ' ' : ''}Item${browseSelectedIds.size !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
