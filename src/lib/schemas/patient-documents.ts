import * as z from 'zod'
import { STORAGE_UPLOAD_MAX_BYTES } from '@/lib/storage/contracts'

export const commitPatientDocumentSchema = z.object({
  patientId: z.uuid(),
  upload: z.object({
    path: z.string().min(1).max(2048),
    cleanupToken: z.string().min(1).max(8192),
  }).strict(),
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(STORAGE_UPLOAD_MAX_BYTES),
}).strict()
