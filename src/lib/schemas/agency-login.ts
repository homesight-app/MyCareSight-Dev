import { z } from 'zod'
import { emailZodField, phoneZodField } from '@/lib/validation'

export const agencyLoginProvisioningSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim(),
  email: emailZodField.transform(value => value.trim().toLowerCase()),
  phone: phoneZodField,
})

export type AgencyLoginProvisioningData = z.infer<typeof agencyLoginProvisioningSchema>
