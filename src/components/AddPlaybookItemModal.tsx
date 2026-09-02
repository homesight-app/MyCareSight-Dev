'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import type { PlaybookItem, ValidationRule } from '@/lib/supabase/query/playbooks'
import { EXPERT_STEP_PHASES } from '@/lib/constants'
import { addPlaybookItem, setPlaybookItemRules } from '@/app/actions/playbooks'

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
}

export default function AddPlaybookItemModal({ isOpen, onClose, playbookId, ruleLibrary, onItemAdded }: Props) {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [activeTypeTab, setActiveTypeTab] = useState<ItemType>('step')
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) return
    setForm(EMPTY_FORM)
    setActiveTypeTab('step')
    setSelectedRuleIds([])
    setError(null)
  }, [isOpen])

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
    if (t !== 'document') setSelectedRuleIds([])
  }

  const toggleRule = (id: string) =>
    setSelectedRuleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleSubmit = async (e: React.FormEvent) => {
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
      phase: form.phase || null,
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

  const showRulePicker = activeTypeTab === 'document' && ruleLibrary.length > 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Item" size="xl">
      {/* Step / Document type selector */}
      <div className="flex border-b border-gray-200 mb-5 -mt-1">
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

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
            selectEl(form.phase, v => setForm(f => ({ ...f, phase: v })), [
              { value: '', label: '— None —' },
              ...EXPERT_STEP_PHASES.map(p => ({ value: p.value, label: p.label })),
            ])
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
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand flex-shrink-0"
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
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={isSaving || !form.name.trim()}
            loading={isSaving}
          >
            Add Item
          </Button>
        </div>
      </form>
    </Modal>
  )
}
