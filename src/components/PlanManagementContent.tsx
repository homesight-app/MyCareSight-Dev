'use client'

import { useEffect, useState, useTransition } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Layers, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { AGENCY_CAPABILITIES, getCapability, type CapabilityKey } from '@/lib/constants/feature-keys'
import { featurePlanInputSchema, type FeaturePlanInput } from '@/lib/schemas/feature-plans'
import { createPlan, deletePlan, updatePlan } from '@/app/actions/feature-plans'
import type { FeaturePlanRow } from '@/lib/supabase/query/feature-plans'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'

interface Props {
  plans: (FeaturePlanRow & { agency_count?: number })[]
}

function CapabilityChecklist({
  selected,
  onChange,
}: {
  selected: CapabilityKey[]
  onChange: (next: CapabilityKey[]) => void
}) {
  const selectedSet = new Set(selected)
  return (
    <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3">
      {AGENCY_CAPABILITIES.map(capability => (
        <label
          key={capability.key}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 p-3 hover:bg-slate-50"
        >
          <input
            type="checkbox"
            checked={selectedSet.has(capability.key)}
            onChange={() => {
              onChange(
                selectedSet.has(capability.key)
                  ? selected.filter(key => key !== capability.key)
                  : [...selected, capability.key]
              )
            }}
            className="mt-0.5 rounded border-gray-300 text-slate-800 focus:ring-slate-600"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">{capability.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{capability.description}</span>
            <span className="mt-1 block text-xs text-slate-600">
              Includes: {capability.includes.join(', ')}
            </span>
          </span>
        </label>
      ))}
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
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FeaturePlanInput>({
    resolver: zodResolver(featurePlanInputSchema),
    mode: 'onBlur',
    defaultValues: {
      name: plan?.name ?? '',
      description: plan?.description ?? null,
      sortOrder: plan?.sort_order ?? 0,
      capabilityKeys: (plan?.plan_capabilities ?? []).map(item => item.capability_key),
    },
  })
  const selected = watch('capabilityKeys') ?? []

  const submit = handleSubmit(async values => {
    const result = isEdit
      ? await updatePlan({ ...values, planId: plan.id })
      : await createPlan(values)

    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof FeaturePlanInput, { message: messages[0] })
      }
    }
    if (!result.success) {
      toast.error(result.error ?? 'Unable to save the plan.')
      return
    }
    toast.success(isEdit ? 'Plan updated.' : 'Plan created.')
    onClose()
    onSaved()
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{isEdit ? 'Edit Plan' : 'New Plan'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="plan-name" className="mb-1 block text-sm font-medium text-slate-700">
              Plan Name <span className="text-red-600">*</span>
            </label>
            <input
              id="plan-name"
              type="text"
              {...register('name')}
              placeholder="e.g. Basic, Pro, Enterprise"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-600"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="plan-description" className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <input
              id="plan-description"
              type="text"
              {...register('description', { setValueAs: value => value?.trim() || null })}
              placeholder="Optional plan description"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-600"
            />
            {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
          </div>

          <input type="hidden" {...register('sortOrder', { valueAsNumber: true })} />

          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">
              Capabilities included ({selected.length})
            </div>
            <CapabilityChecklist
              selected={selected}
              onChange={next => setValue('capabilityKeys', next, { shouldDirty: true, shouldValidate: true })}
            />
            {errors.capabilityKeys && <p className="mt-1 text-xs text-red-600">{errors.capabilityKeys.message}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Plan'}
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
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<FeaturePlanRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FeaturePlanRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()

  useEffect(() => { setPlans(initialPlans) }, [initialPlans])

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleteError(null)
    startDeleteTransition(async () => {
      const result = await deletePlan(deleteTarget.id)
      if (!result.success) {
        setDeleteError(result.error ?? 'Unable to delete the plan.')
        return
      }
      setPlans(previous => previous.filter(plan => plan.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success('Plan deleted.')
    })
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Feature Plans</h1>
          <p className="mt-1 text-sm text-slate-500">Define plan tiers and grant stable business capabilities to agencies.</p>
        </div>
        <button type="button" onClick={() => { setEditingPlan(null); setModalOpen(true) }} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          <Plus className="h-4 w-4" /> New Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center">
          <Layers className="mx-auto mb-3 h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <p className="text-sm text-slate-500">No plans created yet. Create a plan to grant agency capabilities.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-10 px-2" />
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Plan</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Capabilities</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Agencies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {plans.map(plan => {
                const labels = plan.plan_capabilities.map(item => getCapability(item.capability_key)?.label ?? item.capability_key)
                return (
                  <tr key={plan.id} className="hover:bg-gray-50/50">
                    <td className="w-10 px-2 py-3">
                      <RecordActionsMenu
                        label={`Actions for ${plan.name}`}
                        actions={[
                          { label: 'Edit Plan', icon: Pencil, onClick: () => { setEditingPlan(plan); setModalOpen(true) } },
                          { label: 'Delete Plan', icon: Trash2, onClick: () => { setDeleteTarget(plan); setDeleteError(null) }, destructive: true },
                        ]}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{plan.name}</div>
                      {plan.description && <div className="mt-0.5 text-xs text-slate-500">{plan.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-xl flex-wrap gap-1">
                        {labels.length === 0 ? <span className="text-xs italic text-slate-400">Baseline access only</span> : labels.map(label => (
                          <span key={label} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{label}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${(plan.agency_count ?? 0) > 0 ? 'text-slate-900' : 'text-slate-400'}`}>{plan.agency_count ?? 0}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <PlanModal plan={editingPlan} onClose={() => setModalOpen(false)} onSaved={() => router.refresh()} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} aria-hidden="true" />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Delete &ldquo;{deleteTarget.name}&rdquo;?</h2>
            <p className="mb-4 text-sm text-slate-500">This permanently removes the plan and its capability assignments.</p>
            {deleteError && <p className="mb-3 text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={handleDeleteConfirm} disabled={deletePending} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deletePending ? 'Deleting…' : 'Delete Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
