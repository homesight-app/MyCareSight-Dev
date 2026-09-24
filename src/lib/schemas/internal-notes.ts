import { z } from 'zod'

export const internalNoteSubjectSchema = z.enum([
  'patient', 'caregiver', 'visit', 'application', 'application_step',
  'application_document', 'application_playbook_item',
])
export type InternalNoteSubjectType = z.infer<typeof internalNoteSubjectSchema>
export const applicationNoteSubjectSchema = internalNoteSubjectSchema.extract([
  'application', 'application_step', 'application_document', 'application_playbook_item',
])
export const notePanelReadSchema = z.object({
  subjectType: internalNoteSubjectSchema,
  subjectId: z.uuid(),
  agencyId: z.uuid(),
  applicationId: z.uuid().nullable().optional(),
}).strict()
export type NotePanelReadInput = z.infer<typeof notePanelReadSchema>
export const noteCountReadSchema = z.object({
  subjectIds: z.array(z.uuid()).max(500).transform(ids => [...new Set(ids)]),
  subjectType: applicationNoteSubjectSchema.optional(),
  applicationId: z.uuid().optional(),
}).strict()
export type NoteCountReadInput = z.input<typeof noteCountReadSchema>
export const noteSearchAuditSchema = notePanelReadSchema.extend({
  searchTerm: z.string().max(10000),
  resultsReturned: z.number().int().min(0).max(1000),
}).strict()

export const noteContentSchema = z.string().trim().min(1, 'Note content cannot be empty').max(10000, 'Note content is too long')
export const noteEditorSchema = z.object({
  content: noteContentSchema,
  taggedPatientId: z.union([z.uuid(),z.literal(''),z.null()]).optional(),
  taggedCaregiverId: z.union([z.uuid(),z.literal(''),z.null()]).optional(),
}).strict()
export type NoteEditorInput = z.input<typeof noteEditorSchema>
export const noteCreateSchema = notePanelReadSchema.extend(noteEditorSchema.shape).strict()
export const noteUpdateSchema = noteCreateSchema.extend({ noteId: z.uuid() }).strict()
export const noteDeleteSchema = notePanelReadSchema.extend({ noteId: z.uuid() }).strict()
export type NoteCreateInput = z.input<typeof noteCreateSchema>
export type NoteUpdateInput = z.input<typeof noteUpdateSchema>
export type NoteDeleteInput = z.input<typeof noteDeleteSchema>
