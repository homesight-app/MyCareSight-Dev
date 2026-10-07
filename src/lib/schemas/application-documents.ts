import * as z from 'zod'
import { STORAGE_UPLOAD_MAX_BYTES } from '@/lib/storage/contracts'

export const APPLICATION_DOCUMENT_MAX_BYTES = STORAGE_UPLOAD_MAX_BYTES

export const applicationDocumentTypeSchema = z.string().trim().min(1).max(100)

export const applicationDocumentFormSchema = z.object({
  documentName: z.string().trim().min(1, 'Document name is required').max(255),
  documentType: z.string().trim().max(100),
  description: z.string().trim().max(2000, 'Description must be 2,000 characters or fewer'),
})

const storedApplicationDocumentSchema = z.object({
  path: z.string().min(1).max(2048),
  cleanupToken: z.string().min(1).max(8192),
  documentName: z.string().trim().min(1).max(255),
})

export const createApplicationDocumentsSchema = z.object({
  applicationId: z.uuid(),
  uploads: z.array(storedApplicationDocumentSchema).min(1).max(20),
  documentType: applicationDocumentTypeSchema.nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['draft', 'approved', 'pending']).default('draft'),
  licenseRequirementDocumentId: z.uuid().nullable().optional(),
  applicationPlaybookItemId: z.uuid().nullable().optional(),
}).strict()

export const replaceApplicationDocumentSchema = z.object({
  documentId: z.uuid(),
  applicationId: z.uuid(),
  upload: storedApplicationDocumentSchema.omit({ documentName: true }),
  documentName: z.string().trim().min(1).max(255),
  documentType: z.string().trim().max(100).nullable(),
  description: z.string().trim().max(2000).nullable(),
}).strict()

export type ApplicationDocumentFormData = z.infer<typeof applicationDocumentFormSchema>
export type CreateApplicationDocumentsInput = z.input<typeof createApplicationDocumentsSchema>
export type ReplaceApplicationDocumentInput = z.input<typeof replaceApplicationDocumentSchema>
