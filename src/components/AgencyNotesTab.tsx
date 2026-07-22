'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NOTE_TYPES } from '@/lib/constants/lead-configs'
import { addAgencyNote, deleteAgencyNote } from '@/app/actions/agencies'
import { deleteLeadNote } from '@/app/actions/leads'
import * as q from '@/lib/supabase/query'

interface Note {
  id: string
  content: string
  note_type: string
  created_at: string
  source: 'agency' | 'lead'
  lead_id?: string
  author?: { full_name: string | null } | null
}

interface AgencyNotesTabProps {
  agencyId: string
  leadIds: string[]
  leadNameMap: Record<string, string>
}

const noteTypeColorMap: Record<string, string> = {
  call:    'bg-blue-100 text-blue-700',
  email:   'bg-indigo-100 text-indigo-700',
  meeting: 'bg-blue-100 text-blue-700',
  general: 'bg-gray-100 text-gray-600',
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'

export default function AgencyNotesTab({ agencyId, leadIds, leadNameMap }: AgencyNotesTabProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [noteTypeFilter, setNoteTypeFilter] = useState<string>('all')
  const [leadFilter, setLeadFilter] = useState<string>('all') // 'all' | 'agency' | lead_id
  const [newNoteType, setNewNoteType] = useState('general')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const fetchNotes = useCallback(async () => {
    const supabase = createClient()
    const [agencyRes, leadRes] = await Promise.all([
      q.getAgencyNotes(supabase, agencyId),
      q.getLeadNotesByLeadIds(supabase, leadIds),
    ])

    const agencyNotes: Note[] = (agencyRes.data ?? []).map((n: any) => ({
      id: n.id,
      content: n.content,
      note_type: n.note_type,
      created_at: n.created_at,
      source: 'agency' as const,
    }))

    const leadNotes: Note[] = (leadRes.data ?? []).map((n: any) => ({
      id: n.id,
      content: n.content,
      note_type: n.note_type,
      created_at: n.created_at,
      source: 'lead' as const,
      lead_id: n.lead_id,
      author: Array.isArray(n.author) ? (n.author[0] ?? null) : n.author,
    }))

    const combined = [...agencyNotes, ...leadNotes].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    setNotes(combined)
    setLoading(false)
  }, [agencyId, leadIds])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  // Leads that actually have notes (for the lead filter options)
  const leadsWithNotes = useMemo(() => {
    const ids = new Set(notes.filter(n => n.source === 'lead' && n.lead_id).map(n => n.lead_id!))
    return Array.from(ids)
      .map(id => ({ id, name: leadNameMap[id] ?? 'Unknown lead' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [notes, leadNameMap])

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (noteTypeFilter !== 'all' && n.note_type !== noteTypeFilter) return false
      if (leadFilter === 'agency') return n.source === 'agency'
      if (leadFilter !== 'all') return n.source === 'lead' && n.lead_id === leadFilter
      return true
    })
  }, [notes, noteTypeFilter, leadFilter])

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNoteContent.trim()) return
    setAddingNote(true)
    setNoteError(null)
    const { error } = await addAgencyNote(agencyId, { content: newNoteContent.trim(), noteType: newNoteType })
    if (error) { setNoteError(error); setAddingNote(false); return }
    setNewNoteContent('')
    setAddingNote(false)
    await fetchNotes()
  }

  async function handleDeleteNote(note: Note) {
    if (note.source === 'lead' && note.lead_id) {
      await deleteLeadNote(note.lead_id, note.id)
    } else {
      await deleteAgencyNote(agencyId, note.id)
    }
    setNotes(prev => prev.filter(n => n.id !== note.id))
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading notes…</div>
  }

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Note</h3>
        <form onSubmit={handleAddNote} className="space-y-3">
          <div className="flex gap-2">
            {NOTE_TYPES.map(nt => (
              <button
                key={nt.key}
                type="button"
                onClick={() => setNewNoteType(nt.key)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  newNoteType === nt.key
                    ? (noteTypeColorMap[nt.key] ?? 'bg-gray-200 text-gray-700')
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {nt.label}
              </button>
            ))}
          </div>
          <textarea
            value={newNoteContent}
            onChange={e => setNewNoteContent(e.target.value)}
            placeholder="Write a note…"
            rows={3}
            className={`${inputCls} resize-none`}
            required
          />
          {noteError && <p className="text-xs text-red-600">{noteError}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={addingNote || !newNoteContent.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {addingNote ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>

      {/* Filter + feed */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Filter row */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setNoteTypeFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-full font-medium ${noteTypeFilter === 'all' ? 'bg-gray-200 text-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            All
          </button>
          {NOTE_TYPES.map(nt => (
            <button
              key={nt.key}
              type="button"
              onClick={() => setNoteTypeFilter(nt.key)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                noteTypeFilter === nt.key
                  ? (noteTypeColorMap[nt.key] ?? 'bg-gray-200 text-gray-700')
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {nt.label}
            </button>
          ))}
          <div className="ml-auto">
            <select
              value={leadFilter}
              onChange={e => setLeadFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Sources</option>
              <option value="agency">Agency Only</option>
              {leadsWithNotes.map(lead => (
                <option key={lead.id} value={lead.id}>{lead.name}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No notes match the selected filters.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredNotes.map(note => (
              <li key={note.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${noteTypeColorMap[note.note_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {NOTE_TYPES.find(nt => nt.key === note.note_type)?.label ?? note.note_type}
                      </span>
                      <span className="text-xs text-gray-400">{note.author?.full_name ?? 'Unknown'}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400">{relativeTime(note.created_at)}</span>
                      {note.source === 'lead' && note.lead_id && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          Lead: {leadNameMap[note.lead_id] ?? 'Unknown lead'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteNote(note)}
                    className="flex-shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
