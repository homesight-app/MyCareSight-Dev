'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import {
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from '@/app/actions/playbook-categories'

interface Subcategory {
  id: string
  category_id: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
}

interface Category {
  id: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  subcategories: Subcategory[]
}

interface Props {
  initialCategories: Category[]
}

export default function PlaybookCategoriesSection({ initialCategories }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  // Add category form
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatDesc, setNewCatDesc] = useState('')
  const [addCatError, setAddCatError] = useState<string | null>(null)

  // Edit category
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatError, setEditCatError] = useState<string | null>(null)

  // Delete category errors (keyed by id)
  const [deleteCatErrors, setDeleteCatErrors] = useState<Record<string, string>>({})

  // Add subcategory (keyed by category id)
  const [addingSubForCat, setAddingSubForCat] = useState<string | null>(null)
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

  // ── Category handlers ────────────────────────────────────────────────────────

  const handleAddCategory = () => {
    if (!newCatName.trim()) { setAddCatError('Name is required'); return }
    setAddCatError(null)
    startTransition(async () => {
      const result = await createCategory({ name: newCatName.trim(), description: newCatDesc.trim() || undefined })
      if (result.error) { setAddCatError(result.error); return }
      const newCat: Category = {
        id: result.data!.id,
        name: result.data!.name,
        description: result.data!.description,
        is_active: result.data!.is_active,
        sort_order: result.data!.sort_order,
        subcategories: [],
      }
      setCategories(prev => [...prev, newCat])
      setNewCatName('')
      setNewCatDesc('')
      setShowAddCategory(false)
    })
  }

  const startEditCategory = (cat: Category) => {
    setEditingCatId(cat.id)
    setEditCatName(cat.name)
    setEditCatError(null)
  }

  const handleSaveCategory = (catId: string) => {
    if (!editCatName.trim()) { setEditCatError('Name is required'); return }
    setEditCatError(null)
    startTransition(async () => {
      const result = await updateCategory(catId, { name: editCatName.trim() })
      if (result.error) { setEditCatError(result.error); return }
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, name: editCatName.trim() } : c))
      setEditingCatId(null)
    })
  }

  const handleDeleteCategory = (catId: string) => {
    setDeleteCatErrors(prev => ({ ...prev, [catId]: '' }))
    startTransition(async () => {
      const result = await deleteCategory(catId)
      if (result.error) {
        setDeleteCatErrors(prev => ({ ...prev, [catId]: result.error! }))
        return
      }
      setCategories(prev => prev.filter(c => c.id !== catId))
    })
  }

  // ── Subcategory handlers ─────────────────────────────────────────────────────

  const handleAddSubcategory = (catId: string) => {
    if (!newSubName.trim()) { setAddSubError('Name is required'); return }
    setAddSubError(null)
    startTransition(async () => {
      const result = await createSubcategory({ category_id: catId, name: newSubName.trim() })
      if (result.error) { setAddSubError(result.error); return }
      const newSub: Subcategory = {
        id: result.data!.id,
        category_id: catId,
        name: result.data!.name,
        description: result.data!.description,
        is_active: result.data!.is_active,
        sort_order: result.data!.sort_order,
      }
      setCategories(prev => prev.map(c =>
        c.id === catId ? { ...c, subcategories: [...c.subcategories, newSub] } : c
      ))
      setNewSubName('')
      setAddingSubForCat(null)
    })
  }

  const startEditSubcategory = (sub: Subcategory) => {
    setEditingSubId(sub.id)
    setEditSubName(sub.name)
    setEditSubError(null)
  }

  const handleSaveSubcategory = (subId: string, catId: string) => {
    if (!editSubName.trim()) { setEditSubError('Name is required'); return }
    setEditSubError(null)
    startTransition(async () => {
      const result = await updateSubcategory(subId, { name: editSubName.trim() })
      if (result.error) { setEditSubError(result.error); return }
      setCategories(prev => prev.map(c =>
        c.id === catId
          ? { ...c, subcategories: c.subcategories.map(s => s.id === subId ? { ...s, name: editSubName.trim() } : s) }
          : c
      ))
      setEditingSubId(null)
    })
  }

  const handleDeleteSubcategory = (subId: string, catId: string) => {
    setDeleteSubErrors(prev => ({ ...prev, [subId]: '' }))
    startTransition(async () => {
      const result = await deleteSubcategory(subId)
      if (result.error) {
        setDeleteSubErrors(prev => ({ ...prev, [subId]: result.error! }))
        return
      }
      setCategories(prev => prev.map(c =>
        c.id === catId ? { ...c, subcategories: c.subcategories.filter(s => s.id !== subId) } : c
      ))
    })
  }

  return (
    <div className="space-y-3">
      {/* Category list */}
      {categories.map(cat => {
        const isExpanded = expandedIds.has(cat.id)
        const isEditing = editingCatId === cat.id
        const deleteCatErr = deleteCatErrors[cat.id]

        return (
          <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Category row */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
              <button
                type="button"
                onClick={() => toggleExpand(cat.id)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {isEditing ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    type="text"
                    value={editCatName}
                    onChange={e => setEditCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory(cat.id); if (e.key === 'Escape') setEditingCatId(null) }}
                    className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  {editCatError && <span className="text-xs text-red-600">{editCatError}</span>}
                  <button type="button" onClick={() => handleSaveCategory(cat.id)} disabled={isPending} className="text-green-600 hover:text-green-700 disabled:opacity-50"><Check className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setEditingCatId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <span className="flex-1 text-sm font-medium text-gray-900">{cat.name}</span>
              )}

              {!isEditing && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400 mr-1">{cat.subcategories.length} sub</span>
                  <button type="button" onClick={() => startEditCategory(cat)} className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => handleDeleteCategory(cat.id)} disabled={isPending} className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {deleteCatErr && (
              <div className="px-3 py-1.5 bg-red-50 border-t border-red-100 text-xs text-red-600">{deleteCatErr}</div>
            )}

            {/* Subcategories */}
            {isExpanded && (
              <div className="border-t border-gray-200 divide-y divide-gray-100">
                {cat.subcategories.map(sub => {
                  const isEditingSub = editingSubId === sub.id
                  const deleteSubErr = deleteSubErrors[sub.id]
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
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveSubcategory(sub.id, cat.id); if (e.key === 'Escape') setEditingSubId(null) }}
                              className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            {editSubError && <span className="text-xs text-red-600">{editSubError}</span>}
                            <button type="button" onClick={() => handleSaveSubcategory(sub.id, cat.id)} disabled={isPending} className="text-green-600 hover:text-green-700 disabled:opacity-50"><Check className="w-4 h-4" /></button>
                            <button type="button" onClick={() => setEditingSubId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-gray-700">{sub.name}</span>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => startEditSubcategory(sub)} className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => handleDeleteSubcategory(sub.id, cat.id)} disabled={isPending} className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50" title="Delete">
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
                {addingSubForCat === cat.id ? (
                  <div className="flex items-center gap-2 px-4 py-2 pl-9">
                    <input
                      autoFocus
                      type="text"
                      value={newSubName}
                      onChange={e => setNewSubName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddSubcategory(cat.id); if (e.key === 'Escape') { setAddingSubForCat(null); setNewSubName('') } }}
                      placeholder="Subcategory name"
                      className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {addSubError && <span className="text-xs text-red-600">{addSubError}</span>}
                    <button type="button" onClick={() => handleAddSubcategory(cat.id)} disabled={isPending} className="text-green-600 hover:text-green-700 disabled:opacity-50">
                      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button type="button" onClick={() => { setAddingSubForCat(null); setNewSubName(''); setAddSubError(null) }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAddingSubForCat(cat.id); setNewSubName(''); setAddSubError(null); setExpandedIds(prev => new Set([...prev, cat.id])) }}
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

      {/* Add category */}
      {showAddCategory ? (
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
          <input
            autoFocus
            type="text"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setShowAddCategory(false); setNewCatName(''); setNewCatDesc('') } }}
            placeholder="Category name (e.g. Home Health License)"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="text"
            value={newCatDesc}
            onChange={e => setNewCatDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          {addCatError && <p className="text-xs text-red-600">{addCatError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddCategory}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Add Category
            </button>
            <button
              type="button"
              onClick={() => { setShowAddCategory(false); setNewCatName(''); setNewCatDesc(''); setAddCatError(null) }}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddCategory(true)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      )}
    </div>
  )
}
