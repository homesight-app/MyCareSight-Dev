'use client'

import { useState, useOptimistic } from 'react'
import { Lock, Trash2, ChevronUp, ChevronDown, Plus, GripVertical } from 'lucide-react'
import {
  createAgencyLeadStageAction,
  updateAgencyLeadStageAction,
  deleteAgencyLeadStageAction,
  reorderAgencyLeadStagesAction,
} from '@/app/actions/agency-lead-stages'
import type { AgencyLeadStage } from '@/lib/constants/lead-configs'

const COLOR_PRESETS = [
  { label: 'Gray',   value: 'bg-gray-100 text-gray-600',    swatch: 'bg-gray-400' },
  { label: 'Blue',   value: 'bg-blue-100 text-blue-700',    swatch: 'bg-blue-500' },
  { label: 'Indigo', value: 'bg-indigo-100 text-indigo-700', swatch: 'bg-indigo-500' },
  { label: 'Cyan',   value: 'bg-cyan-100 text-cyan-700',    swatch: 'bg-cyan-500' },
  { label: 'Yellow', value: 'bg-yellow-100 text-yellow-700', swatch: 'bg-yellow-400' },
  { label: 'Orange', value: 'bg-orange-100 text-orange-700', swatch: 'bg-orange-500' },
  { label: 'Purple', value: 'bg-purple-100 text-purple-700', swatch: 'bg-purple-500' },
  { label: 'Green',  value: 'bg-green-100 text-green-700',  swatch: 'bg-green-500' },
]

interface Props {
  agencyId: string
  initialStages: AgencyLeadStage[]
}

export default function AgencyLeadStageSettings({ agencyId, initialStages }: Props) {
  const [stages, setStages] = useState<AgencyLeadStage[]>(initialStages)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [labelError, setLabelError] = useState('')
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const customStages = stages.filter(s => !s.is_entry && !s.is_won && !s.is_lost)
  const lockedStages = stages.filter(s => s.is_entry || s.is_won || s.is_lost)

  const startEdit = (stage: AgencyLeadStage) => {
    setEditingId(stage.id)
    setEditLabel(stage.label)
    setLabelError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditLabel('')
    setLabelError('')
  }

  const saveLabel = async (stage: AgencyLeadStage) => {
    if (!editLabel.trim()) {
      setLabelError('Label is required')
      return
    }
    setSaving(stage.id)
    const result = await updateAgencyLeadStageAction(agencyId, stage.id, { label: editLabel.trim() })
    setSaving(null)
    if (!result.success) {
      setError(result.error ?? 'Failed to save')
      return
    }
    setStages(prev => prev.map(s => s.id === stage.id ? { ...s, label: editLabel.trim() } : s))
    setEditingId(null)
  }

  const saveColor = async (stageId: string, color: string) => {
    setSaving(stageId)
    const result = await updateAgencyLeadStageAction(agencyId, stageId, { color })
    setSaving(null)
    if (!result.success) {
      setError(result.error ?? 'Failed to save')
      return
    }
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, color } : s))
    setColorPickerId(null)
  }

  const deleteStage = async (stageId: string) => {
    if (!confirm('Delete this stage? Leads currently at this stage will retain the raw stage key.')) return
    setSaving(stageId)
    const result = await deleteAgencyLeadStageAction(agencyId, stageId)
    setSaving(null)
    if (!result.success) {
      setError(result.error ?? 'Failed to delete')
      return
    }
    setStages(prev => prev.filter(s => s.id !== stageId))
  }

  const moveStage = async (stageId: string, direction: 'up' | 'down') => {
    const custom = [...customStages]
    const idx = custom.findIndex(s => s.id === stageId)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= custom.length) return

    const reordered = [...custom]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]

    const newFullOrder = [
      stages.find(s => s.is_entry)!,
      ...reordered,
      stages.find(s => s.is_won)!,
      stages.find(s => s.is_lost)!,
    ].filter(Boolean)
    setStages(newFullOrder)

    const orderedIds = newFullOrder.map(s => s.id)
    const result = await reorderAgencyLeadStagesAction(agencyId, orderedIds)
    if (!result.success) setError(result.error ?? 'Failed to reorder')
  }

  const addStage = async () => {
    const result = await createAgencyLeadStageAction(agencyId, {
      label: 'New Stage',
      color: 'bg-gray-100 text-gray-600',
    })
    if (!result.success) {
      setError(result.error ?? 'Failed to add stage')
      return
    }
    if (result.data) {
      const newStage: AgencyLeadStage = {
        id: result.data.id,
        key: result.data.key,
        label: result.data.label,
        color: result.data.color,
        sort_order: result.data.sort_order,
        is_entry: false,
        is_won: false,
        is_lost: false,
      }
      setStages(prev => {
        const wonIdx = prev.findIndex(s => s.is_won)
        const next = [...prev]
        next.splice(wonIdx, 0, newStage)
        return next
      })
      startEdit(newStage)
    }
  }

  const badgeCls = (color: string) => {
    const parts = color.split(' ')
    return `${parts[0]} ${parts[1]} px-2 py-0.5 rounded-full text-xs font-medium`
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button className="ml-2 underline text-xs" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="space-y-1">
        {stages.map((stage, stageIdx) => {
          const isLocked = stage.is_entry || stage.is_won || stage.is_lost
          const isEditing = editingId === stage.id
          const isSaving = saving === stage.id
          const customIdx = customStages.findIndex(s => s.id === stage.id)
          const canMoveUp = !isLocked && customIdx > 0
          const canMoveDown = !isLocked && customIdx < customStages.length - 1

          return (
            <div
              key={stage.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${isLocked ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}
            >
              {/* Drag handle placeholder / reorder buttons */}
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  disabled={!canMoveUp || isSaving}
                  onClick={() => moveStage(stage.id, 'up')}
                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!canMoveDown || isSaving}
                  onClick={() => moveStage(stage.id, 'down')}
                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Color swatch */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  disabled={isLocked || isSaving}
                  onClick={() => setColorPickerId(colorPickerId === stage.id ? null : stage.id)}
                  className="w-5 h-5 rounded-full border-2 border-white shadow-sm disabled:cursor-not-allowed"
                  style={{}}
                >
                  <span className={`block w-full h-full rounded-full ${COLOR_PRESETS.find(p => p.value === stage.color)?.swatch ?? 'bg-gray-400'}`} />
                </button>
                {colorPickerId === stage.id && (
                  <div className="absolute left-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1.5 flex-wrap w-40">
                    {COLOR_PRESETS.map(preset => (
                      <button
                        key={preset.value}
                        type="button"
                        title={preset.label}
                        onClick={() => saveColor(stage.id, preset.value)}
                        className={`w-6 h-6 rounded-full border-2 ${preset.value === stage.color ? 'border-gray-800' : 'border-white'} shadow-sm hover:scale-110 transition-transform`}
                      >
                        <span className={`block w-full h-full rounded-full ${preset.swatch}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div>
                    <input
                      type="text"
                      value={editLabel}
                      onChange={e => { setEditLabel(e.target.value); if (e.target.value.trim()) setLabelError('') }}
                      onBlur={() => saveLabel(stage)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); saveLabel(stage) }
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      autoFocus
                      className="w-full px-2 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {labelError && (
                      <p className="mt-0.5 text-xs text-red-600">{labelError}</p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => !isLocked && startEdit(stage)}
                    className={`text-sm font-medium text-left w-full truncate ${isLocked ? 'text-gray-500 cursor-default' : 'text-gray-800 hover:text-blue-600'}`}
                  >
                    <span className={badgeCls(stage.color)}>{stage.label}</span>
                  </button>
                )}
              </div>

              {/* Lock / Delete */}
              <div className="flex-shrink-0 flex items-center gap-1">
                {isLocked ? (
                  <span title={stage.is_entry ? 'Entry stage — locked' : stage.is_won ? 'Conversion gate — locked' : 'Closed-Lost — locked'}>
                    <Lock className="w-3.5 h-3.5 text-gray-300" />
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => deleteStage(stage.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addStage}
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
      >
        <Plus className="w-4 h-4" />
        Add Stage
      </button>

      <p className="text-xs text-gray-400">
        Click a stage label to rename it. Click a color swatch to change color. Locked stages (New, Closed&nbsp;–&nbsp;Won, Closed&nbsp;–&nbsp;Lost) cannot be renamed or deleted.
      </p>
    </div>
  )
}
