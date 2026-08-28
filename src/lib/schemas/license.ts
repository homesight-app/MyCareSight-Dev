import { z } from 'zod'

export const licenseSchema = z.object({
  license_name: z.string().min(1, 'License name is required').min(3, 'License name must be at least 3 characters'),
  license_number: z.string().optional(),
  state: z.string().optional(),
  expiry_date: z.string().min(1, 'Expiry date is required'),
  activated_date: z.string().min(1, 'Activated date is required'),
  renewal_due_date: z.string().optional(),
  issuing_body: z.string().optional(),
})

export type CreateLicenseFormData = z.infer<typeof licenseSchema>
