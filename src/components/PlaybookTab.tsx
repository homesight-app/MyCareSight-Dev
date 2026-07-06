'use client'

import { useState, useEffect } from 'react'
import { GripVertical, Plus, Edit2, Trash2, Download, FileText, Loader2 } from 'lucide-react'
import PlaybookItemModal from '@/components/PlaybookItemModal'
import AddPlaybookItemModal from '@/components/AddPlaybookItemModal'
import type { PlaybookItem, ValidationRule } from '@/lib/supabase/query/playbooks'
import {
  addPlaybookItem,
  updatePlaybookItem,
  deletePlaybookItem,
  reorderPlaybookItems,
  importFromRequirement,
  getValidationRuleLibrary,
  getPlaybookItemRules,
  setPlaybookItemRules,
} from '@/app/actions/playbooks'

type Assignment = 'client' | 'expert' | 'both'
type RequirementType = 'required' | 'optional'

interface Props {
  playbookId: string
  licenseRequirementId?: string
  initialItems: PlaybookItem[]
  onItemCountChange?: (count: number) => void
}

const REQUIREMENT_COLORS: Record<RequirementType, string> = {
  required: 'bg-blue-100 text-blue-700',
  optional: 'bg-gray-100 text-gray-600',
}

const ASSIGNMENT_COLORS: Record<Assignment, string> = {
  client: 'bg-green-100 text-green-700',
  expert: 'bg-purple-100 text-purple-700',
  both: 'bg-teal-100 text-teal-700',
}

export default function PlaybookTab({ playbookId, licenseRequirementId, initialItems, onItemCountChange }: Props) {
  const [items, setItems] = useState<PlaybookItem[]>(initialItems)
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => { onItemCountChange?.(items.length) }, [items.length, onItemCountChange])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterAssignment, setFilterAssignment] = useState<'all' | Assignment>('all')
  const [filterRequirement, setFilterRequirement] = useState<'all' | RequirementType>('all')
  const [filterPhase, setFilterPhase] = useState<string>('all')

  // Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<PlaybookItem | null>(null)
  const [editItemRuleIds, setEditItemRuleIds] = useState<string[]>([])
  const [ruleLibrary, setRuleLibrary] = useState<ValidationRule[]>([])

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Load rule library once on mount
  useEffect(() => {
    getValidationRuleLibrary().then(r => {
      if (!r.error) setRuleLibrary(r.rules)
    })
  }, [])

  // Unique phases for filter dropdown
  const phases = Array.from(new Set(items.map(i => i.phase).filter(Boolean))) as string[]

  const visibleItems = items.filter(item => {
    if (filterAssignment !== 'all' && item.assignment !== filterAssignment) return false
    if (filterRequirement !== 'all' && item.requirement_type !== filterRequirement) return false
    if (filterPhase !== 'all' && item.phase !== filterPhase) return false
    return true
  })

  // ── Import ──────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!confirm('Import all current Steps, Expert Steps, and Documents into this Playbook? This will bring in everything from the Steps, Documents, and Expert Process tabs in one ordered list.')) return
    setIsImporting(true)
    setError(null)
    const result = await importFromRequirement(playbookId, licenseRequirementId!)
    if (result.error && result.error !== 'Playbook already has items') {
      setError(result.error)
      setIsImporting(false)
    } else {
      window.location.reload()
    }
  }

  // ── Add / Edit ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    setShowAddModal(true)
  }

  const handleItemAdded = (item: PlaybookItem) => {
    setItems(prev => [...prev, item])
    setShowAddModal(false)
  }

  const handleItemsCopied = (newItems: PlaybookItem[]) => {
    setItems(prev => [...prev, ...newItems].sort((a, b) => a.item_order - b.item_order))
    setShowAddModal(false)
  }

  const openEdit = async (item: PlaybookItem) => {
    setEditItem(item)
    setEditItemRuleIds([])
    setShowModal(true)
    if (item.item_type === 'document') {
      const r = await getPlaybookItemRules(item.id)
      if (!r.error) setEditItemRuleIds(r.ruleIds)
    }
  }

  const handleSave = async (
    formData: {
      item_type: 'step' | 'document'
      name: string
      description: string
      instructions: string
      estimated_days: number | null
      document_type: string
      phase: string
      assignment: Assignment
      requirement_type: RequirementType
    },
    selectedRuleIds: string[]
  ) => {
    setIsSaving(true)
    setError(null)

    const payload = {
      item_type: formData.item_type,
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      instructions: formData.instructions.trim() || null,
      estimated_days: formData.estimated_days,
      document_type: formData.document_type.trim() || null,
      phase: formData.phase.trim() || null,
      assignment: formData.assignment,
      requirement_type: formData.requirement_type,
    }

    if (editItem) {
      const result = await updatePlaybookItem(editItem.id, payload)
      if (result.error) {
        setError(result.error)
        setIsSaving(false)
        return
      }
      if (formData.item_type === 'document') {
        await setPlaybookItemRules(editItem.id, selectedRuleIds)
      }
      setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, ...payload, updated_at: new Date().toISOString() } : i))
      setShowModal(false)
    } else {
      const result = await addPlaybookItem(playbookId, payload)
      if (result.error) {
        setError(result.error)
        setIsSaving(false)
        return
      }
      if (result.item && formData.item_type === 'document') {
        await setPlaybookItemRules(result.item.id, selectedRuleIds)
      }
      if (result.item) {
        setItems(prev => [...prev, result.item as PlaybookItem])
      }
      setShowModal(false)
    }
    setIsSaving(false)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item from the playbook?')) return
    setError(null)
    const result = await deletePlaybookItem(id)
    if (result.error) {
      setError(result.error)
    } else {
      setItems(prev => prev.filter(i => i.id !== id).map((item, idx) => ({ ...item, item_order: idx + 1 })))
    }
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }

  const handleDragLeave = () => setDragOverId(null)

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragOverId(null)
    const draggedItemId = e.dataTransfer.getData('text/plain')
    if (!draggedItemId || draggedItemId === targetId) return

    const fromIndex = items.findIndex(i => i.id === draggedItemId)
    const toIndex = items.findIndex(i => i.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    const reordered = [...items]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    const withOrder = reordered.map((item, idx) => ({ ...item, item_order: idx + 1 }))
    setItems(withOrder)
    setDraggedId(null)

    const result = await reorderPlaybookItems(playbookId, withOrder.map(i => i.id))
    if (result.error) {
      setError(result.error)
      setItems(items) // revert
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Playbook
          {items.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">({items.length} items)</span>}
        </h3>
        <div className="flex items-center gap-2">
          {items.length === 0 && licenseRequirementId && (
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Import from existing tabs
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assignment</span>
            <select
              value={filterAssignment}
              onChange={e => setFilterAssignment(e.target.value as typeof filterAssignment)}
              className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="client">Client</option>
              <option value="expert">Expert</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</span>
            <select
              value={filterRequirement}
              onChange={e => setFilterRequirement(e.target.value as typeof filterRequirement)}
              className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
          </div>
          {phases.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phase</span>
              <select
                value={filterPhase}
                onChange={e => setFilterPhase(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All</option>
                {phases.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          {(filterAssignment !== 'all' || filterRequirement !== 'all' || filterPhase !== 'all') && (
            <button
              onClick={() => { setFilterAssignment('all'); setFilterRequirement('all'); setFilterPhase('all') }}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">No items in this playbook yet</p>
          <p className="text-sm mt-1">{licenseRequirementId ? 'Import from the existing Steps and Documents tabs, or add items manually.' : 'Add items manually using the button above.'}</p>
        </div>
      )}

      {/* Item list */}
      {visibleItems.length > 0 && (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              onDragOver={e => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, item.id)}
              className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                draggedId === item.id
                  ? 'opacity-40 border-blue-300'
                  : dragOverId === item.id
                  ? 'border-blue-400 border-2 bg-blue-50/50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              {/* Drag handle */}
              <div
                draggable
                onDragStart={e => handleDragStart(e, item.id)}
                onDragEnd={handleDragEnd}
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0"
              >
                <GripVertical className="w-4 h-4" />
              </div>

              {/* Order number */}
              <span className="text-xs font-mono text-gray-400 w-5 text-right flex-shrink-0">
                {item.item_order}
              </span>

              {/* Type badge */}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                item.item_type === 'step' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'
              }`}>
                {item.item_type === 'step' ? 'Step' : 'Doc'}
              </span>

              {/* Name */}
              <span className="flex-1 text-sm text-gray-900 min-w-0 truncate">{item.name}</span>

              {/* Phase */}
              {item.phase && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0 hidden sm:inline-block">
                  {item.phase}
                </span>
              )}

              {/* Assignment */}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${ASSIGNMENT_COLORS[item.assignment]}`}>
                {item.assignment}
              </span>

              {/* Requirement type */}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${REQUIREMENT_COLORS[item.requirement_type]}`}>
                {item.requirement_type}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openEdit(item)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtered empty state */}
      {items.length > 0 && visibleItems.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No items match the current filters.
        </div>
      )}

      <AddPlaybookItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        playbookId={playbookId}
        ruleLibrary={ruleLibrary}
        onItemAdded={handleItemAdded}
        onItemsCopied={handleItemsCopied}
      />

      <PlaybookItemModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        editItem={editItem}
        initialSelectedRuleIds={editItemRuleIds}
        ruleLibrary={ruleLibrary}
        isSaving={isSaving}
      />
    </div>
  )
}
