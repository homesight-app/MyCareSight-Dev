'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/Modal'
import { EXPERT_STEP_PHASES } from '@/lib/constants'
import { addProgramItem } from '@/app/actions/playbooks'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'

type ItemType = 'step' | 'document'
type Assignment = 'client' | 'expert' | 'both'
type RequirementType = 'required' | 'optional'

interface FormState {
  name: string
  description: string
  instructions: string
  document_type: string
  phase: string
  assignment: Assignment
  requirement_type: RequirementType
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  instructions: '',
  document_type: '',
  phase: '',
  assignment: 'expert',
  requirement_type: 'required',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  applicationId: string
  defaultType?: ItemType
  onItemAdded: (item: ApplicationPlaybookItem) => void
}

export default function AddProgramItemModal({ isOpen, onClose, applicationId, defaultType = 'step', onItemAdded }: Props) {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [activeTypeTab, setActiveTypeTab] = useState<ItemType>(defaultType)

  useEffect(() => {
    if (!isOpen) return
    setForm(EMPTY_FORM)
    setActiveTypeTab(defaultType)
    setError(null)
  }, [isOpen, defaultType])

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
  const textareaCls = inputCls + ' resize-none'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setIsSaving(true)
    setError(null)

    const result = await addProgramItem(applicationId, {
      item_type: activeTypeTab,
      name: form.name.trim(),
      description: form.description.trim() || null,
      instructions: activeTypeTab === 'step' ? (form.instructions.trim() || null) : null,
      document_type: activeTypeTab === 'document' ? (form.document_type.trim() || null) : null,
      phase: form.phase || null,
      assignment: form.assignment,
      requirement_type: form.requirement_type,
    })

    if (result.error) { setError(result.error); setIsSaving(false); return }
    if (result.data) onItemAdded(result.data as ApplicationPlaybookItem)
    setIsSaving(false)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Item">
      {/* Step / Document type selector */}
      <div className="flex border-b border-gray-200 mb-5 -mt-1">
        {(['step', 'document'] as ItemType[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTypeTab(t)}
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
            placeholder={activeTypeTab === 'step' ? 'e.g., Submit signed affidavit' : 'e.g., Certificate of Insurance (COI)'}
            required
            autoFocus
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

        {activeTypeTab === 'step' && field('Instructions',
          <textarea
            className={textareaCls}
            rows={3}
            value={form.instructions}
            onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
            placeholder="Step-by-step instructions for completing this item"
          />
        )}

        {activeTypeTab === 'document' && field('Document Type',
          <input
            className={inputCls}
            value={form.document_type}
            onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
            placeholder="e.g., Certificate, License, Agreement"
          />
        )}

        {field('Phase',
          <select
            value={form.phase}
            onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}
            className={inputCls + ' bg-white'}
          >
            <option value="">— No phase —</option>
            {EXPERT_STEP_PHASES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        )}

        <div className="grid grid-cols-2 gap-4">
          {field('Assignment',
            <select
              value={form.assignment}
              onChange={e => setForm(f => ({ ...f, assignment: e.target.value as Assignment }))}
              className={inputCls + ' bg-white'}
            >
              <option value="client">Client</option>
              <option value="expert">Expert</option>
              <option value="both">Both</option>
            </select>
          )}

          {field('Requirement',
            <select
              value={form.requirement_type}
              onChange={e => setForm(f => ({ ...f, requirement_type: e.target.value as RequirementType }))}
              className={inputCls + ' bg-white'}
            >
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !form.name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Adding…' : `Add ${activeTypeTab === 'step' ? 'Step' : 'Document'}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
