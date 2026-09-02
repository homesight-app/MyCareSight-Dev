'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Trash2, X, Check, Loader2, FileText, Tag, Link as LinkIcon } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import SearchInput from '@/components/ui/SearchInput'
import { createClient } from '@/lib/supabase/client'
import { patientFullName } from '@/lib/patient-name'
import {
  addInternalNoteAction,
  editInternalNoteAction,
  deleteInternalNoteAction,
  logNoteSearchAction,
} from '@/app/actions/internal-notes'
import type { InternalNoteSubjectType } from '@/lib/supabase/query/internal-notes'

interface NoteRow {
  id: string
  content: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string | null
  tagged_patient_id: string | null
  tagged_caregiver_id: string | null
  author: { full_name: string | null } | null
  updater: { full_name: string | null } | null
  tagged_patient: { id: string; first_name: string; last_name: string } | null
  tagged_caregiver: { id: string; first_name: string; last_name: string } | null
}

interface AssociatedNoteRow {
  id: string
  content: string
  subject_type: string
  subject_id: string
  created_at: string
  tagged_patient_id: string | null
  tagged_caregiver_id: string | null
  author: { full_name: string | null } | null
}

type UnifiedNote = {
  id: string
  content: string
  created_at: string
  tagged_patient_id: string | null
  tagged_caregiver_id: string | null
  author: { full_name: string | null } | null
  // direct-only fields
  updated_at?: string
  updated_by?: string | null
  tagged_patient?: { id: string; first_name: string; last_name: string } | null
  tagged_caregiver?: { id: string; first_name: string; last_name: string } | null
  updater?: { full_name: string | null } | null
  // discriminator
  source: 'direct' | 'associated'
  // associated-only fields
  subject_type?: string
  subject_id?: string
}

interface PatientTagOption {
  id: string
  first_name: string
  last_name: string
}

interface CaregiverTagOption {
  id: string
  first_name: string
  last_name: string
}

const APPLICATION_SUBJECT_TYPES = new Set(['application', 'application_step', 'application_document', 'application_playbook_item'])

interface InternalNotesPanelProps {
  subjectType: InternalNoteSubjectType
  subjectId: string
  agencyId: string
  canManage: boolean
  applicationId?: string | null
}

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  return (
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  )
}

function caregiverFullName(p: { first_name: string; last_name: string }) {
  return `${p.first_name} ${p.last_name}`.trim() || 'Caregiver'
}

function sourceBadgeLabel(subjectType: string) {
  if (subjectType === 'patient')   return 'From Client'
  if (subjectType === 'caregiver') return 'From Caregiver'
  return 'From Visit'
}

function sourceLink(subjectType: string, subjectId: string) {
  if (subjectType === 'patient')   return `/pages/agency/clients/${subjectId}`
  if (subjectType === 'caregiver') return `/pages/agency/caregiver/${subjectId}`
  return `/pages/agency/care-visits`
}

export default function InternalNotesPanel({
  subjectType,
  subjectId,
  agencyId,
  canManage,
  applicationId,
}: InternalNotesPanelProps) {
  const isAppNote = APPLICATION_SUBJECT_TYPES.has(subjectType)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [associatedNotes, setAssociatedNotes] = useState<AssociatedNoteRow[]>([])
  const [tagPatients, setTagPatients] = useState<PatientTagOption[]>([])
  const [tagCaregivers, setTagCaregivers] = useState<CaregiverTagOption[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [addContent, setAddContent] = useState('')
  const [addTagPatient, setAddTagPatient] = useState<string>('')
  const [addTagCaregiver, setAddTagCaregiver] = useState<string>('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTagPatient, setEditTagPatient] = useState<string>('')
  const [editTagCaregiver, setEditTagCaregiver] = useState<string>('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'direct' | 'associated'>('all')
  const [authorFilter, setAuthorFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Debounced search for audit logging
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 600)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Unified sorted feed
  const unifiedNotes = useMemo<UnifiedNote[]>(() => {
    const direct: UnifiedNote[] = notes.map(n => ({ ...n, source: 'direct' as const }))
    const assoc: UnifiedNote[] = associatedNotes.map(n => ({ ...n, source: 'associated' as const }))
    return [...direct, ...assoc].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [notes, associatedNotes])

  // Unique author names for the author filter dropdown
  const authorOptions = useMemo(() =>
    Array.from(
      new Set(
        unifiedNotes
          .map(n => n.author?.full_name)
          .filter((name): name is string => Boolean(name))
      )
    ).sort()
  , [unifiedNotes])

  // Filtered feed (all filters applied client-side)
  const filteredNotes = useMemo(() => {
    let r = unifiedNotes
    if (sourceFilter !== 'all')   r = r.filter(n => n.source === sourceFilter)
    if (searchQuery.trim())       r = r.filter(n => n.content.toLowerCase().includes(searchQuery.toLowerCase()))
    if (authorFilter)             r = r.filter(n => n.author?.full_name === authorFilter)
    if (dateFrom)                 r = r.filter(n => n.created_at.slice(0, 10) >= dateFrom)
    if (dateTo)                   r = r.filter(n => n.created_at.slice(0, 10) <= dateTo)
    return r
  }, [unifiedNotes, sourceFilter, searchQuery, authorFilter, dateFrom, dateTo])

  // HIPAA audit log: fire when debounced search term settles to ≥ 3 chars
  useEffect(() => {
    if (debouncedSearch.trim().length < 3) return
    logNoteSearchAction({
      agencyId,
      subjectType,
      subjectId,
      searchTerm: debouncedSearch.trim(),
      resultsReturned: filteredNotes.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const hasActiveFilters =
    searchQuery !== '' || sourceFilter !== 'all' || authorFilter !== '' || dateFrom !== '' || dateTo !== ''

  const clearFilters = () => {
    setSearchQuery('')
    setSourceFilter('all')
    setAuthorFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()

    const notesQuery = supabase
      .from('internal_notes')
      .select(`
        id, content, created_at, updated_at, created_by, updated_by,
        tagged_patient_id, tagged_caregiver_id,
        author:user_profiles!internal_notes_created_by_fkey(full_name),
        updater:user_profiles!internal_notes_updated_by_fkey(full_name),
        tagged_patient:patients!internal_notes_tagged_patient_id_fkey(id, first_name, last_name),
        tagged_caregiver:caregiver_members!internal_notes_tagged_caregiver_id_fkey(id, first_name, last_name)
      `)
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false })

    const assocQuery =
      subjectType === 'patient'
        ? supabase
            .from('internal_notes')
            .select(`id, content, subject_type, subject_id, created_at, tagged_patient_id, tagged_caregiver_id, author:user_profiles!internal_notes_created_by_fkey(full_name)`)
            .eq('tagged_patient_id', subjectId)
            .order('created_at', { ascending: false })
        : subjectType === 'caregiver'
          ? supabase
              .from('internal_notes')
              .select(`id, content, subject_type, subject_id, created_at, tagged_patient_id, tagged_caregiver_id, author:user_profiles!internal_notes_created_by_fkey(full_name)`)
              .eq('tagged_caregiver_id', subjectId)
              .order('created_at', { ascending: false })
          : null

    const patientsQuery = isAppNote
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('patients')
          .select('id, first_name, last_name')
          .eq('agency_id', agencyId)
          .order('last_name')

    const caregiversQuery = isAppNote
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('caregiver_members')
          .select('id, first_name, last_name')
          .eq('agency_id', agencyId)
          .order('last_name')

    const [notesRes, assocRes, patientsRes, caregiversRes] = await Promise.all([
      notesQuery,
      assocQuery ?? Promise.resolve({ data: [], error: null }),
      patientsQuery,
      caregiversQuery,
    ])

    setLoading(false)

    setTagPatients((patientsRes.data as unknown as PatientTagOption[]) ?? [])
    setTagCaregivers((caregiversRes.data as unknown as CaregiverTagOption[]) ?? [])

    if (notesRes.error) {
      setFetchError('Failed to load notes.')
      return
    }

    setNotes((notesRes.data as unknown as NoteRow[]) ?? [])

    const rawAssoc = (assocRes.data as unknown as AssociatedNoteRow[]) ?? []
    setAssociatedNotes(
      rawAssoc.filter(
        (n) => !(n.subject_type === subjectType && n.subject_id === subjectId)
      )
    )
  }, [subjectType, subjectId, agencyId, isAppNote])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleAdd = async () => {
    if (!addContent.trim()) return
    setAddLoading(true)
    setAddError(null)
    const result = await addInternalNoteAction({
      subjectType,
      subjectId,
      agencyId,
      content: addContent,
      applicationId: applicationId ?? null,
      taggedPatientId:   isAppNote ? null : (addTagPatient   || null),
      taggedCaregiverId: isAppNote ? null : (addTagCaregiver || null),
    })
    setAddLoading(false)
    if (result.error) { setAddError(result.error); return }
    setAddContent('')
    setAddTagPatient('')
    setAddTagCaregiver('')
    setShowAddForm(false)
    await fetchAll()
  }

  const startEdit = (note: UnifiedNote) => {
    setEditingId(note.id)
    setEditContent(note.content)
    setEditTagPatient(note.tagged_patient_id ?? '')
    setEditTagCaregiver(note.tagged_caregiver_id ?? '')
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
    setEditTagPatient('')
    setEditTagCaregiver('')
    setEditError(null)
  }

  const handleEdit = async (noteId: string) => {
    if (!editContent.trim()) return
    setEditLoading(true)
    setEditError(null)
    const result = await editInternalNoteAction({
      noteId,
      content: editContent,
      agencyId,
      subjectType,
      subjectId,
      applicationId: applicationId ?? null,
      taggedPatientId:   isAppNote ? null : (editTagPatient   || null),
      taggedCaregiverId: isAppNote ? null : (editTagCaregiver || null),
    })
    setEditLoading(false)
    if (result.error) { setEditError(result.error); return }
    cancelEdit()
    await fetchAll()
  }

  const handleDelete = async (noteId: string) => {
    setDeleteLoading(true)
    const result = await deleteInternalNoteAction({ noteId, agencyId, subjectType, subjectId, applicationId: applicationId ?? null })
    setDeleteLoading(false)
    if (result.error) return
    setDeletingId(null)
    await fetchAll()
  }

  const TagSelects = ({
    patientVal,
    caregiverVal,
    onPatientChange,
    onCaregiverChange,
    disabled,
  }: {
    patientVal: string
    caregiverVal: string
    onPatientChange: (v: string) => void
    onCaregiverChange: (v: string) => void
    disabled: boolean
  }) => (
    <div className="grid grid-cols-2 gap-3 mt-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          <Tag className="w-3 h-3 inline mr-1" />Tag a client
        </label>
        <select
          value={patientVal}
          onChange={(e) => onPatientChange(e.target.value)}
          disabled={disabled}
          className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
        >
          <option value="">None</option>
          {tagPatients.map((p) => (
            <option key={p.id} value={p.id}>{patientFullName(p)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          <Tag className="w-3 h-3 inline mr-1" />Tag a caregiver
        </label>
        <select
          value={caregiverVal}
          onChange={(e) => onCaregiverChange(e.target.value)}
          disabled={disabled}
          className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
        >
          <option value="">None</option>
          {tagCaregivers.map((c) => (
            <option key={c.id} value={c.id}>{caregiverFullName(c)}</option>
          ))}
        </select>
      </div>
    </div>
  )

  const showAssocFilter = associatedNotes.length > 0

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500" />
          <h3 className="text-base font-semibold text-gray-900">Internal Notes</h3>
          {unifiedNotes.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {unifiedNotes.length}
            </span>
          )}
        </div>
        {canManage && !showAddForm && (
          <button
            onClick={() => { setShowAddForm(true); setAddError(null) }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Note
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Add note form */}
        {showAddForm && canManage && (
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40">
            <textarea
              value={addContent}
              onChange={(e) => setAddContent(e.target.value)}
              placeholder="Enter your note..."
              rows={4}
              className="w-full text-sm text-gray-900 bg-white border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              disabled={addLoading}
              autoFocus
            />
            {!isAppNote && (
              <TagSelects
                patientVal={addTagPatient}
                caregiverVal={addTagCaregiver}
                onPatientChange={setAddTagPatient}
                onCaregiverChange={setAddTagCaregiver}
                disabled={addLoading}
              />
            )}
            {addError && <p className="mt-1.5 text-sm text-red-600">{addError}</p>}
            <div className="flex items-center justify-end gap-2 mt-3">
              <button
                onClick={() => { setShowAddForm(false); setAddContent(''); setAddTagPatient(''); setAddTagCaregiver(''); setAddError(null) }}
                disabled={addLoading}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                disabled={addLoading || !addContent.trim()}
                loading={addLoading}
              >
                {addLoading ? 'Saving...' : 'Save Note'}
              </Button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
                <div className="h-12 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && fetchError && (
          <p className="text-sm text-red-600">{fetchError}</p>
        )}

        {/* Empty state — no notes at all */}
        {!loading && !fetchError && unifiedNotes.length === 0 && !showAddForm && (
          <p className="text-sm text-gray-500 text-center py-4">No internal notes yet.</p>
        )}

        {/* Filter bar — only when there are notes to filter */}
        {!loading && !fetchError && unifiedNotes.length > 0 && (
          <div className="space-y-2.5 pb-1">
            {/* Search */}
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search notes…"
            />

            {/* Source pills + Author + Date row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Source pills — only when there are associated notes */}
              {showAssocFilter && (
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  {(['all', 'direct', 'associated'] as const).map((f) => {
                    const count =
                      f === 'all' ? unifiedNotes.length
                      : f === 'direct' ? notes.length
                      : associatedNotes.length
                    return (
                      <button
                        key={f}
                        onClick={() => setSourceFilter(f)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          sourceFilter === f
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {f === 'all' ? 'All' : f === 'direct' ? 'Direct' : 'Associated'} ({count})
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Author filter */}
              {authorOptions.length > 1 && (
                <select
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-700"
                >
                  <option value="">All authors</option>
                  {authorOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}

              {/* Date range */}
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-700"
                  title="From date"
                />
                <span>–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-700"
                  title="To date"
                />
              </div>

              {/* Clear filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline ml-auto"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty filtered state */}
        {!loading && !fetchError && unifiedNotes.length > 0 && filteredNotes.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No notes match your filters.</p>
            <button onClick={clearFilters} className="mt-1 text-xs text-blue-600 hover:underline">
              Clear filters
            </button>
          </div>
        )}

        {/* Unified notes feed */}
        {!loading && filteredNotes.map((note) => (
          <div
            key={note.id}
            className={`border rounded-xl p-4 ${
              note.source === 'associated'
                ? 'border-violet-100 bg-violet-50/20'
                : 'border-gray-200 bg-gray-50/50'
            }`}
          >
            {/* Source badge for associated notes */}
            {note.source === 'associated' && note.subject_type && note.subject_id && (
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-100 border border-violet-200 px-2 py-0.5 rounded-full">
                  <LinkIcon className="w-3 h-3" />
                  {sourceBadgeLabel(note.subject_type)}
                </span>
                <Link
                  href={sourceLink(note.subject_type, note.subject_id)}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                >
                  <LinkIcon className="w-3 h-3" />
                  View
                </Link>
              </div>
            )}

            {/* Note header: author + timestamp + edit/delete buttons */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="text-xs text-gray-500 leading-relaxed">
                <span className="font-medium text-gray-700">
                  {note.author?.full_name ?? 'Unknown'}
                </span>
                {' · '}
                {formatTimestamp(note.created_at)}
                {note.source === 'direct' && note.updated_at && note.updated_at !== note.created_at && (
                  <span className="ml-1 text-gray-400">
                    (edited{note.updater?.full_name ? ` by ${note.updater.full_name}` : ''})
                  </span>
                )}
              </div>
              {note.source === 'direct' && canManage && editingId !== note.id && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(note)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit note"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingId(note.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Edit mode (direct notes only) */}
            {note.source === 'direct' && editingId === note.id ? (
              <div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={4}
                  className="w-full text-sm text-gray-900 bg-white border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                  disabled={editLoading}
                  autoFocus
                />
                {!isAppNote && (
                  <TagSelects
                    patientVal={editTagPatient}
                    caregiverVal={editTagCaregiver}
                    onPatientChange={setEditTagPatient}
                    onCaregiverChange={setEditTagCaregiver}
                    disabled={editLoading}
                  />
                )}
                {editError && <p className="mt-1 text-sm text-red-600">{editError}</p>}
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    onClick={cancelEdit}
                    disabled={editLoading}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Cancel edit"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(note.id)}
                    disabled={editLoading || !editContent.trim()}
                    className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Save edit"
                  >
                    {editLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ) : note.source === 'direct' && deletingId === note.id ? (
              /* Delete confirmation (direct notes only) */
              <div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{note.content}</p>
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-red-700 flex-1">Delete this note?</span>
                  <button
                    onClick={() => setDeletingId(null)}
                    disabled={deleteLoading}
                    className="px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    disabled={deleteLoading}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleteLoading ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Deleting...</>
                    ) : (
                      'Confirm Delete'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Read mode */
              <div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                {/* Tag badges (direct notes only — associated notes don't carry expanded tag objects) */}
                {note.source === 'direct' && (note.tagged_patient || note.tagged_caregiver) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {note.tagged_patient && (
                      <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">
                        <Tag className="w-2.5 h-2.5" />
                        {patientFullName(note.tagged_patient)} (Client)
                      </span>
                    )}
                    {note.tagged_caregiver && (
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                        <Tag className="w-2.5 h-2.5" />
                        {caregiverFullName(note.tagged_caregiver)} (Caregiver)
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
