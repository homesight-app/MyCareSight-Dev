import * as z from 'zod'
import { STORAGE_UPLOAD_MAX_BYTES } from '@/lib/storage/contracts'

export const LEAD_DOCUMENT_TYPES = [
  'Proposal', 'Contract', 'Agreement', 'Invoice', 'NDA', 'Other',
] as const

export const commitLeadDocumentSchema = z.object({
  leadId: z.uuid(),
  upload: z.object({
    path: z.string().min(1).max(2048),
    cleanupToken: z.string().min(1).max(8192),
  }).strict(),
  name: z.string().trim().min(1).max(255),
  originalFileName: z.string().trim().min(1).max(255),
  documentType: z.enum(LEAD_DOCUMENT_TYPES).nullable(),
  size: z.number().int().min(1).max(STORAGE_UPLOAD_MAX_BYTES),
}).strict()

