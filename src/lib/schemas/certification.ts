import { z } from 'zod'

export const certificationSchema = z.object({
  type: z.string().min(1, 'Certification type is required'),
  license_number: z.string().min(1, 'License/certification number is required'),
  expiration_date: z.string().min(1, 'Expiration date is required'),
  issuing_authority: z.string().min(1, 'Issuing authority is required'),
  state: z.string().optional().nullable(),
  issue_date: z.string().optional().nullable(),
  status: z.string(),
  document_url: z.string().optional().nullable(),
})

export type CertificationFormData = z.infer<typeof certificationSchema>
