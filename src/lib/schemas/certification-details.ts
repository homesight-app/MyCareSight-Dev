import { z } from 'zod'
import { US_STATES } from '@/lib/constants'

const optionalText = (maximum: number) => z.string().trim().max(maximum)
const optionalDate = z.union([
  z.literal(''),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
])

export const certificationDetailsSchema = z.object({
  license_name: z.string().trim().min(1, 'Certification name is required').max(200),
  license_number: optionalText(100),
  state: z.string().refine(value => value === '' || US_STATES.includes(value), 'Select a valid state'),
  status: z.enum(['active', 'expired', 'pending']),
  category_id: z.union([z.literal(''), z.uuid('Select a valid category')]),
  issuing_body: optionalText(200),
  activated_date: optionalDate,
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date is required'),
  renewal_due_date: optionalDate,
}).strict()

export type CertificationDetailsInput = z.infer<typeof certificationDetailsSchema>
