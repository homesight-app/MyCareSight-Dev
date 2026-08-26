'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, X, Layers } from 'lucide-react'
import { AGENCY_FEATURES } from '@/lib/constants/feature-keys'
import { createPlan, updatePlan, deletePlan } from '@/app/actions/feature-plans'
import type { FeaturePlanRow } from '@/lib/supabase/query/feature-plans'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'

interface Props {
  plans: (FeaturePlanRow & { agency_count?: number })[]
}

const SECTION_KEYS = AGENCY_FEATURES.filter(f => f.parentKey === null)
const SUB_KEYS = AGENCY_FEATURES.filter(f => f.parentKey !== null)

function getSubKeysForParent(parentKey: string) {
  return SUB_KEYS.filter(f => f.parentKey === parentKey)
}

function FeatureChecklist({
  selected,
  onChange,
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  function toggle(key: string) {
    const next = new Set(selected)
    const feature = AGENCY_FEATURES.find(f => f.key === key)
    if (next.has(key)) {
      next.delete(key)
      // Also uncheck all sub-features of this section key
      for (const sub of SUB_KEYS) {
        if (sub.parentKey === key) next.delete(sub.key)
      }
    } else {
      next.add(key)
      // Auto-check parent if this is a sub-feature
      if (feature && (feature as { parentKey: string | null }).parentKey) {
        next.add((feature as { parentKey: string }).parentKey)
      }
    }
    onChange(next)
  }

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-3">
      {SECTION_KEYS.map(section => {
        const subs = getSubKeysForParent(section.key)
        return (
          <div key={section.key}>
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(section.key)}
                onChange={() => toggle(section.key)}
                className="rounded border-gray-300 text-slate-800 focus:ring-slate-600"
              />
              <span className="text-sm font-medium text-slate-800">{section.label}</span>
            </label>
            {subs.map(sub => (
              <label key={sub.key} className="flex items-center gap-2 py-1 pl-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(sub.key)}
                  onChange={() => toggle(sub.key)}
                  className="rounded border-gray-300 text-slate-800 focus:ring-slate-600"
                />
                <span className="text-sm text-slate-600">{sub.label}</span>
              </label>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function PlanModal({
  plan,
  onClose,
  onSaved,
}: {
  plan?: FeaturePlanRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!plan
  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [sortOrder, setSortOrder] = useState(plan?.sort_order ?? 0)
  const [selected, setSelected] = useState<Set<string>>(
    new Set((plan?.plan_features ?? []).map(f => f.feature_key))
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Plan name is required.'); return }
    setError(null)
    startTransition(async () => {
      const keys = Array.from(selected)
      const result = isEdit
        ? await updatePlan(plan!.id, name, description || null, sortOrder, keys)
        : await createPlan(name, description || null, sortOrder, keys)
      if (result.error) { setError(result.error); return }
      onClose()
      onSaved()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-slate-900">{isEdit ? 'Edit Plan' : 'New Plan'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Basic, Pro, Enterprise"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional plan description"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-600"
            />
          </div>

          {/* <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={e => setSortOrder(Number(e.target.value))}
              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-600"
            />
          </div> */}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Features included ({selected.size})
            </label>
            <FeatureChecklist selected={selected} onChange={setSelected} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {pending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PlanManagementContent({ plans: initialPlans }: Props) {
  const router = useRouter()
  const [plans, setPlans] = useState(initialPlans)
  useEffect(() => { setPlans(initialPlans) }, [initialPlans])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<FeaturePlanRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FeaturePlanRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()

  function handleSaved() {
    router.refresh()
  }

  function openCreate() {
    setEditingPlan(null)
    setModalOpen(true)
  }

  function openEdit(plan: FeaturePlanRow) {
    setEditingPlan(plan)
    setModalOpen(true)
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleteError(null)
    startDeleteTransition(async () => {
      const result = await deletePlan(deleteTarget.id)
      if (result.error) { setDeleteError(result.error); return }
      setPlans(prev => prev.filter(p => p.id !== deleteTarget.id))
      setDeleteTarget(null)
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Feature Plans</h1>
          <p className="text-sm text-slate-500 mt-1">Define plan tiers and control which features each agency can access.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
          <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm">No plans created yet. Create your first plan to start gating features.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-10 px-2" />
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Features</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Agencies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {plans.map(plan => {
                const featureLabels = plan.plan_features
                  .map(f => AGENCY_FEATURES.find(a => a.key === f.feature_key)?.label ?? f.feature_key)
                return (
                  <tr key={plan.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="w-10 px-2 py-3">
                      <RecordActionsMenu
                        label={`Actions for ${plan.name}`}
                        actions={[
                          { label: 'Edit Plan', icon: Pencil, onClick: () => openEdit(plan) },
                          { label: 'Delete Plan', icon: Trash2, onClick: () => { setDeleteTarget(plan); setDeleteError(null) }, destructive: true },
                        ]}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{plan.name}</div>
                      {plan.description && <div className="text-xs text-slate-500 mt-0.5">{plan.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {featureLabels.length === 0 ? (
                          <span className="text-slate-400 text-xs italic">No features</span>
                        ) : (
                          featureLabels.map(label => (
                            <span key={label} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                              {label}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${(plan.agency_count ?? 0) > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                        {plan.agency_count ?? 0}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <PlanModal
          plan={editingPlan}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} aria-hidden="true" />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Delete &ldquo;{deleteTarget.name}&rdquo;?</h2>
            <p className="text-sm text-slate-500 mb-4">
              This will permanently remove the plan and all its feature assignments. This cannot be undone.
            </p>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deletePending}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deletePending ? 'Deleting…' : 'Delete Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
