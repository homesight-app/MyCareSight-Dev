'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import type { PlaybookItem, ValidationRule } from '@/lib/supabase/query/playbooks'
import { EXPERT_STEP_PHASES } from '@/lib/constants'

type ItemType = 'step' | 'document'
type Assignment = 'client' | 'expert' | 'both'
type RequirementType = 'required' | 'optional'

interface FormState {
  item_type: ItemType
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
  item_type: 'step',
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
  onSave: (
    data: Omit<FormState, 'estimated_days'> & { estimated_days: number | null },
    selectedRuleIds: string[]
  ) => Promise<void>
  editItem?: PlaybookItem | null
  initialSelectedRuleIds?: string[]
  ruleLibrary?: ValidationRule[]
  isSaving?: boolean
}

export default function PlaybookItemModal({
  isOpen,
  onClose,
  onSave,
  editItem,
  initialSelectedRuleIds = [],
  ruleLibrary = [],
  isSaving,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [activeTypeTab, setActiveTypeTab] = useState<ItemType>('step')
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) return
    if (editItem) {
      setForm({
        item_type: editItem.item_type,
        name: editItem.name,
        description: editItem.description ?? '',
        instructions: editItem.instructions ?? '',
        estimated_days: editItem.estimated_days != null ? String(editItem.estimated_days) : '',
        document_type: editItem.document_type ?? '',
        phase: editItem.phase ?? '',
        assignment: editItem.assignment,
        requirement_type: editItem.requirement_type,
      })
      setActiveTypeTab(editItem.item_type)
      setSelectedRuleIds(initialSelectedRuleIds)
    } else {
      setForm({ ...EMPTY_FORM, item_type: activeTypeTab })
      setSelectedRuleIds([])
    }
  }, [editItem, isOpen])

  // Sync rule selection when initialSelectedRuleIds loads async
  useEffect(() => {
    if (isOpen && editItem) setSelectedRuleIds(initialSelectedRuleIds)
  }, [initialSelectedRuleIds, isOpen])

  const handleTypeTabChange = (type: ItemType) => {
    setActiveTypeTab(type)
    setForm(f => ({ ...f, item_type: type }))
    if (type !== 'document') setSelectedRuleIds([])
  }

  const toggleRule = (ruleId: string) => {
    setSelectedRuleIds(prev =>
      prev.includes(ruleId) ? prev.filter(id => id !== ruleId) : [...prev, ruleId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave(
      {
        ...form,
        item_type: activeTypeTab,
        estimated_days: form.estimated_days ? parseInt(form.estimated_days) : null,
      },
      activeTypeTab === 'document' ? selectedRuleIds : []
    )
  }

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )

  const input = (props: React.InputHTMLAttributes<HTMLInputElement> & { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <input
      {...props}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
    />
  )

  const textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void }) => (
    <textarea
      {...props}
      rows={3}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
    />
  )

  const select = <T extends string>(value: T, onChange: (v: T) => void, options: { value: T; label: string }[]) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  const isEdit = !!editItem
  const showRulePicker = activeTypeTab === 'document' && ruleLibrary.length > 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Item' : 'Add Item'}
      size="lg"
    >
      {/* Type tab (only shown when creating) */}
      {!isEdit && (
        <div className="flex border-b border-gray-200 mb-5">
          {(['step', 'document'] as ItemType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeTabChange(t)}
              className={`py-2.5 px-5 border-b-2 font-medium text-sm capitalize transition-colors -mb-px ${
                activeTypeTab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {field('Name', input({
          value: form.name,
          onChange: e => setForm(f => ({ ...f, name: e.target.value })),
          placeholder: activeTypeTab === 'step' ? 'e.g., Client provides Certificate of Status' : 'e.g., Certificate of Insurance (COI)',
          required: true,
        }))}

        {field('Description', textarea({
          value: form.description,
          onChange: e => setForm(f => ({ ...f, description: e.target.value })),
          placeholder: 'Optional details about this item',
        }))}

        {activeTypeTab === 'step' && (
          <>
            {field('Instructions', textarea({
              value: form.instructions,
              onChange: e => setForm(f => ({ ...f, instructions: e.target.value })),
              placeholder: 'Step-by-step guidance for completing this item',
            }))}
            {field('Estimated Days', input({
              type: 'number',
              min: '0',
              value: form.estimated_days,
              onChange: e => setForm(f => ({ ...f, estimated_days: e.target.value })),
              placeholder: 'e.g., 5',
            }))}
          </>
        )}

        {activeTypeTab === 'document' && (
          field('Document Type', input({
            value: form.document_type,
            onChange: e => setForm(f => ({ ...f, document_type: e.target.value })),
            placeholder: 'e.g., Government ID, Certificate, License',
          }))
        )}

        <div className="grid grid-cols-3 gap-3 pt-1">
          {field('Phase', select(form.phase, v => setForm(f => ({ ...f, phase: v })), [
            { value: '', label: '— None —' },
            ...EXPERT_STEP_PHASES.map(p => ({ value: p.value, label: p.label })),
          ]))}

          {field('Assignment', select(form.assignment, v => setForm(f => ({ ...f, assignment: v })), [
            { value: 'client', label: 'Client' },
            { value: 'expert', label: 'Expert' },
          ]))}

          {field('Requirement', select(form.requirement_type, v => setForm(f => ({ ...f, requirement_type: v })), [
            { value: 'required', label: 'Required' },
            { value: 'optional', label: 'Optional' },
          ]))}
        </div>

        {/* Validation Rules — document items only */}
        {showRulePicker && (
          <div className="pt-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Validation Rules
              <span className="ml-1 text-xs font-normal text-gray-400">(expert checks these against the agency record when reviewing)</span>
            </label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {ruleLibrary.map(rule => {
                const checked = selectedRuleIds.includes(rule.id)
                return (
                  <label
                    key={rule.id}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRule(rule.id)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${checked ? 'text-blue-800' : 'text-gray-800'}`}>
                        {rule.name}
                      </p>
                      {rule.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>
                      )}
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
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={isSaving || !form.name.trim()} loading={isSaving}>
            {isEdit ? 'Save Changes' : 'Add Item'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
