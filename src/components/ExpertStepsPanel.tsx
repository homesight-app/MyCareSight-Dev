'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { EXPERT_STEP_PHASES } from '@/lib/constants'
import ApplicationNotesModal from './ApplicationNotesModal'

export interface ExpertStep {
  id: string
  step_name: string
  step_order?: number | null
  description?: string | null
  is_completed?: boolean | null
  phase?: string | null
}

interface ExpertStepsPanelProps {
  applicationId: string
  agencyId?: string | null
  expertSteps: ExpertStep[]
  /** When true the completion circle is a clickable toggle; when false it is read-only. */
  canToggle: boolean
  /** Called after a successful toggle so the parent can re-fetch. */
  onStepsChanged: () => void
}

export default function ExpertStepsPanel({
  applicationId,
  agencyId,
  expertSteps,
  canToggle,
  onStepsChanged,
}: ExpertStepsPanelProps) {
  const [optimisticSteps, setOptimisticSteps] = useState<ExpertStep[]>(expertSteps)
  const [togglingStepId, setTogglingStepId] = useState<string | null>(null)
  const [notesModal, setNotesModal] = useState<{ stepId: string; stepName: string } | null>(null)
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})

  const fetchNoteCounts = useCallback(async (subjectIds: string[]) => {
    if (!subjectIds.length) return
    const { data } = await createClient()
      .from('internal_notes')
      .select('subject_id')
      .in('subject_id', subjectIds)
    if (!data) return
    const counts: Record<string, number> = {}
    for (const row of data as { subject_id: string }[]) {
      counts[row.subject_id] = (counts[row.subject_id] ?? 0) + 1
    }
    setNoteCounts(prev => ({ ...prev, ...counts }))
  }, [])

  useEffect(() => {
    if (agencyId && expertSteps.length > 0) {
      fetchNoteCounts(expertSteps.map(s => s.id))
    }
  }, [expertSteps, agencyId, fetchNoteCounts])

  useEffect(() => {
    setOptimisticSteps(expertSteps)
  }, [expertSteps])

  const handleToggle = async (step: ExpertStep) => {
    if (!canToggle || !applicationId) return
    const newCompleted = !step.is_completed
    setOptimisticSteps((prev) =>
      prev.map((s) => (s.id === step.id ? { ...s, is_completed: newCompleted } : s))
    )
    setTogglingStepId(step.id)
    try {
      const { error } = await q.updateApplicationStepCompleteById(
        createClient(),
        step.id,
        applicationId,
        {
          is_completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        }
      )
      if (error) throw error
      onStepsChanged()
    } catch (err: unknown) {
      setOptimisticSteps((prev) =>
        prev.map((s) => (s.id === step.id ? { ...s, is_completed: step.is_completed } : s))
      )
      const msg = err instanceof Error ? err.message : 'Unknown error'
      alert('Failed to update step: ' + msg)
    } finally {
      setTogglingStepId(null)
    }
  }

  if (optimisticSteps.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">No expert process steps found</p>
        <p className="text-xs mt-1">Expert steps added by the assigned expert will appear here</p>
      </div>
    )
  }

  // Group steps by phase in canonical order
  const phaseOrder = EXPERT_STEP_PHASES.map((p) => p.value)
  const byPhase = new Map<string, ExpertStep[]>()
  for (const step of optimisticSteps) {
    const phase = step.phase?.trim() || 'Other'
    if (!byPhase.has(phase)) byPhase.set(phase, [])
    byPhase.get(phase)!.push(step)
  }
  Array.from(byPhase.values()).forEach((steps) => {
    steps.sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))
  })
  const orderedPhases = Array.from(byPhase.keys()).sort((a, b) => {
    const i = phaseOrder.indexOf(a)
    const j = phaseOrder.indexOf(b)
    if (i !== -1 && j !== -1) return i - j
    if (i !== -1) return -1
    if (j !== -1) return 1
    return a.localeCompare(b)
  })

  return (
    <>
    <div className="space-y-6">
      {orderedPhases.map((phase) => (
        <div key={phase}>
          <h4 className="text-lg font-semibold text-gray-900 mb-4">{phase}:</h4>
          <div className="space-y-3">
            {(byPhase.get(phase) ?? []).map((step, index) => (
              <div
                key={step.id}
                className={`flex items-start gap-4 p-4 border rounded-lg transition-colors ${
                  step.is_completed
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 flex-shrink-0">
                  {canToggle ? (
                    <button
                      type="button"
                      onClick={() => handleToggle(step)}
                      disabled={togglingStepId === step.id}
                      className="p-0.5 rounded-full hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={step.is_completed ? 'Mark as not completed' : 'Mark as completed'}
                      aria-label={step.is_completed ? 'Uncomplete step' : 'Complete step'}
                    >
                      {togglingStepId === step.id ? (
                        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                      ) : step.is_completed ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                      )}
                    </button>
                  ) : (
                    step.is_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                    )
                  )}
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-white">{index + 1}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 mb-1">{step.step_name}</h4>
                  {step.description && (
                    <p className="text-sm text-gray-600">{step.description}</p>
                  )}
                  {agencyId && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setNotesModal({ stepId: step.id, stepName: step.step_name }) }}
                      className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full hover:bg-amber-100 transition-colors"
                    >
                      Notes
                      {(noteCounts[step.id] ?? 0) > 0 && (
                        <span className="bg-amber-200 text-amber-800 rounded-full px-1 leading-none font-semibold">
                          {noteCounts[step.id]}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    {notesModal && agencyId && (
      <ApplicationNotesModal
        isOpen={true}
        onClose={() => { fetchNoteCounts([notesModal.stepId]); setNotesModal(null) }}
        subjectType="application_step"
        subjectId={notesModal.stepId}
        agencyId={agencyId}
        applicationId={applicationId}
        title={`Notes — ${notesModal.stepName}`}
      />
    )}
    </>
  )
}
