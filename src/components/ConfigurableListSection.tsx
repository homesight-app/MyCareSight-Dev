'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import {
  createConfigurationValue,
  updateConfigurationValue,
  deleteConfigurationValue,
} from '@/app/actions/configuration-values'

interface SubValue {
  id: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
}

interface ConfigValue {
  id: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  subcategories: SubValue[]
}

interface Props {
  typeCode: string
  initialValues: ConfigValue[]
}

export default function ConfigurableListSection({ typeCode, initialValues }: Props) {
  const [values, setValues] = useState<ConfigValue[]>(initialValues)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  // Add top-level form
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  // Edit top-level
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  // Delete top-level errors (keyed by id)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})

  // Add subcategory (keyed by parent id)
  const [addingSubForId, setAddingSubForId] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')
  const [addSubError, setAddSubError] = useState<string | null>(null)

  // Edit subcategory
  const [editingSubId, setEditingSubId] = useState<string | null>(null)
  const [editSubName, setEditSubName] = useState('')
  const [editSubError, setEditSubError] = useState<string | null>(null)

  // Delete subcategory errors (keyed by id)
  const [deleteSubErrors, setDeleteSubErrors] = useState<Record<string, string>>({})

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Top-level handlers ───────────────────────────────────────────────────────

  const handleAdd = () => {
    if (!newName.trim()) { setAddError('Name is required'); return }
    setAddError(null)
    startTransition(async () => {
      const result = await createConfigurationValue({
        type_code:   typeCode,
        name:        newName.trim(),
        description: newDesc.trim() || undefined,
      })
      if (result.error) { setAddError(result.error); return }
      const row = result.data!
      setValues(prev => [...prev, {
        id:           row.id,
        name:         row.name,
        description:  row.description,
        is_active:    row.is_active,
        sort_order:   row.sort_order,
        subcategories: [],
      }])
      setNewName('')
      setNewDesc('')
      setShowAdd(false)
    })
  }

  const startEdit = (v: ConfigValue) => {
    setEditingId(v.id)
    setEditName(v.name)
    setEditError(null)
  }

  const handleSave = (id: string) => {
    if (!editName.trim()) { setEditError('Name is required'); return }
    setEditError(null)
    startTransition(async () => {
      const result = await updateConfigurationValue(id, { name: editName.trim() })
      if (result.error) { setEditError(result.error); return }
      setValues(prev => prev.map(v => v.id === id ? { ...v, name: editName.trim() } : v))
      setEditingId(null)
    })
  }

  const handleDelete = (id: string) => {
    setDeleteErrors(prev => ({ ...prev, [id]: '' }))
    startTransition(async () => {
      const result = await deleteConfigurationValue(id)
      if (result.error) {
        setDeleteErrors(prev => ({ ...prev, [id]: result.error! }))
        return
      }
      setValues(prev => prev.filter(v => v.id !== id))
    })
  }

  // ── Subcategory handlers ─────────────────────────────────────────────────────

  const handleAddSub = (parentId: string) => {
    if (!newSubName.trim()) { setAddSubError('Name is required'); return }
    setAddSubError(null)
    startTransition(async () => {
      const result = await createConfigurationValue({
        type_code: typeCode,
        parent_id: parentId,
        name:      newSubName.trim(),
      })
      if (result.error) { setAddSubError(result.error); return }
      const row = result.data!
      setValues(prev => prev.map(v =>
        v.id === parentId
          ? { ...v, subcategories: [...v.subcategories, { id: row.id, name: row.name, description: row.description, is_active: row.is_active, sort_order: row.sort_order }] }
          : v
      ))
      setNewSubName('')
      setAddingSubForId(null)
    })
  }

  const startEditSub = (sub: SubValue) => {
    setEditingSubId(sub.id)
    setEditSubName(sub.name)
    setEditSubError(null)
  }

  const handleSaveSub = (subId: string, parentId: string) => {
    if (!editSubName.trim()) { setEditSubError('Name is required'); return }
    setEditSubError(null)
    startTransition(async () => {
      const result = await updateConfigurationValue(subId, { name: editSubName.trim() })
      if (result.error) { setEditSubError(result.error); return }
      setValues(prev => prev.map(v =>
        v.id === parentId
          ? { ...v, subcategories: v.subcategories.map(s => s.id === subId ? { ...s, name: editSubName.trim() } : s) }
          : v
      ))
      setEditingSubId(null)
    })
  }

  const handleDeleteSub = (subId: string, parentId: string) => {
    setDeleteSubErrors(prev => ({ ...prev, [subId]: '' }))
    startTransition(async () => {
      const result = await deleteConfigurationValue(subId)
      if (result.error) {
        setDeleteSubErrors(prev => ({ ...prev, [subId]: result.error! }))
        return
      }
      setValues(prev => prev.map(v =>
        v.id === parentId ? { ...v, subcategories: v.subcategories.filter(s => s.id !== subId) } : v
      ))
    })
  }

  return (
    <div className="space-y-3">
      {values.map(v => {
        const isExpanded = expandedIds.has(v.id)
        const isEditing  = editingId === v.id
        const deleteErr  = deleteErrors[v.id]

        return (
          <div key={v.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Top-level row */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
              <button
                type="button"
                onClick={() => toggleExpand(v.id)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {isEditing ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(v.id); if (e.key === 'Escape') setEditingId(null) }}
                    className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  {editError && <span className="text-xs text-red-600">{editError}</span>}
                  <button type="button" onClick={() => handleSave(v.id)} disabled={isPending} className="text-green-600 hover:text-green-700 disabled:opacity-50"><Check className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <span className="flex-1 text-sm font-medium text-gray-900">{v.name}</span>
              )}

              {!isEditing && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400 mr-1">{v.subcategories.length} sub</span>
                  <button type="button" onClick={() => startEdit(v)} className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => handleDelete(v.id)} disabled={isPending} className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {deleteErr && (
              <div className="px-3 py-1.5 bg-red-50 border-t border-red-100 text-xs text-red-600">{deleteErr}</div>
            )}

            {/* Subcategories */}
            {isExpanded && (
              <div className="border-t border-gray-200 divide-y divide-gray-100">
                {v.subcategories.map(sub => {
                  const isEditingSub  = editingSubId === sub.id
                  const deleteSubErr  = deleteSubErrors[sub.id]
                  return (
                    <div key={sub.id}>
                      <div className="flex items-center gap-2 px-4 py-2 pl-9">
                        {isEditingSub ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              autoFocus
                              type="text"
                              value={editSubName}
                              onChange={e => setEditSubName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveSub(sub.id, v.id); if (e.key === 'Escape') setEditingSubId(null) }}
                              className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            {editSubError && <span className="text-xs text-red-600">{editSubError}</span>}
                            <button type="button" onClick={() => handleSaveSub(sub.id, v.id)} disabled={isPending} className="text-green-600 hover:text-green-700 disabled:opacity-50"><Check className="w-4 h-4" /></button>
                            <button type="button" onClick={() => setEditingSubId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-gray-700">{sub.name}</span>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => startEditSub(sub)} className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => handleDeleteSub(sub.id, v.id)} disabled={isPending} className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      {deleteSubErr && (
                        <div className="px-4 pl-9 pb-1.5 text-xs text-red-600">{deleteSubErr}</div>
                      )}
                    </div>
                  )
                })}

                {/* Add subcategory */}
                {addingSubForId === v.id ? (
                  <div className="flex items-center gap-2 px-4 py-2 pl-9">
                    <input
                      autoFocus
                      type="text"
                      value={newSubName}
                      onChange={e => setNewSubName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddSub(v.id); if (e.key === 'Escape') { setAddingSubForId(null); setNewSubName('') } }}
                      placeholder="Subcategory name"
                      className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {addSubError && <span className="text-xs text-red-600">{addSubError}</span>}
                    <button type="button" onClick={() => handleAddSub(v.id)} disabled={isPending} className="text-green-600 hover:text-green-700 disabled:opacity-50">
                      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button type="button" onClick={() => { setAddingSubForId(null); setNewSubName(''); setAddSubError(null) }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAddingSubForId(v.id); setNewSubName(''); setAddSubError(null); setExpandedIds(prev => new Set([...prev, v.id])) }}
                    className="flex items-center gap-1.5 px-4 py-2 pl-9 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 w-full transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Subcategory
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Add top-level value */}
      {showAdd ? (
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setShowAdd(false); setNewName(''); setNewDesc('') } }}
            placeholder="Category name (e.g. Home Health License)"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="text"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Add Category
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setNewName(''); setNewDesc(''); setAddError(null) }}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      )}
    </div>
  )
}
