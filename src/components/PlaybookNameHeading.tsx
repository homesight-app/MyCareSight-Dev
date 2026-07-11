'use client'

import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { updatePlaybook } from '@/app/actions/playbooks'

interface Props {
  playbookId: string
  initialName: string
}

export default function PlaybookNameHeading({ playbookId, initialName }: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [draft, setDraft] = useState(initialName)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) { setEditing(false); setDraft(name); return }
    setSaving(true)
    await updatePlaybook(playbookId, { name: trimmed })
    setName(trimmed)
    setEditing(false)
    setSaving(false)
  }

  const handleCancel = () => {
    setDraft(name)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
          className="text-2xl md:text-3xl font-bold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent flex-1 min-w-0"
          disabled={saving}
        />
        <button
          onClick={handleSave}
          disabled={saving || !draft.trim()}
          className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50 flex-shrink-0"
          title="Save"
        >
          <Check className="w-5 h-5" />
        </button>
        <button
          onClick={handleCancel}
          className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{name}</h1>
      <button
        onClick={() => { setDraft(name); setEditing(true) }}
        className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        title="Edit name"
      >
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  )
}
