import { z } from 'zod'
import { LEAD_DOCUMENT_TYPES } from './lead-documents'
import { STORAGE_UPLOAD_FILE_EXTENSIONS, STORAGE_UPLOAD_MAX_BYTES } from '@/lib/storage/contracts'

export const AGENCY_DOCUMENT_TYPES = LEAD_DOCUMENT_TYPES

const metadataSchema = z.object({
  documentName: z.string().trim().min(1, 'Document name is required').max(255, 'Use 255 characters or fewer'),
  documentType: z.union([z.enum(AGENCY_DOCUMENT_TYPES), z.literal('')]),
})

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File
export const agencyDocumentFormSchema = metadataSchema.extend({
  file: z.custom<File>(isFile, 'Choose a file').superRefine((file, context) => {
    if (!isFile(file)) return
    if (file.size < 1) context.addIssue({ code: 'custom', message: 'Choose a non-empty file' })
    if (file.size > STORAGE_UPLOAD_MAX_BYTES) context.addIssue({ code: 'custom', message: 'Files must be 10 MB or smaller' })
    if (!Object.prototype.hasOwnProperty.call(STORAGE_UPLOAD_FILE_EXTENSIONS, file.type.toLowerCase())) context.addIssue({ code: 'custom', message: 'Choose a supported document or image file' })
  }),
})
export type AgencyDocumentForm = z.infer<typeof agencyDocumentFormSchema>

export const commitAgencyDocumentSchema = metadataSchema.extend({
  agencyId: z.uuid(),
  upload: z.object({ path: z.string().min(1).max(2048), cleanupToken: z.string().min(1).max(8192) }).strict(),
  originalFileName: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(STORAGE_UPLOAD_MAX_BYTES),
}).strict()
