import { z } from 'zod'

export const createPlaybookSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['license_requirement', 'package', 'onboarding', 'compliance']),
  state: z.string().optional(),
  description: z.string().optional(),
  processingTime: z.string().optional(),
  costDisplay: z.string().optional(),
  serviceFeeDisplay: z.string().optional(),
  renewalPeriodDisplay: z.string().optional(),
  iconType: z.string().optional(),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
})

export type CreatePlaybookFormData = z.infer<typeof createPlaybookSchema>
