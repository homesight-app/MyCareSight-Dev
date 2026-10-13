import { z } from 'zod'

export const caregiverHomeAddressSchema = z.object({
  caregiverMemberId: z.uuid(),
  streetAddress: z.string().trim().max(200),
  city: z.string().trim().max(100),
  state: z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2}$/, 'Use a two-letter state code.'),
  zipCode: z.string().trim().regex(/^$|^\d{5}(?:-\d{4})?$/, 'Enter a valid ZIP code.'),
}).strict()

export type CaregiverHomeAddressInput = z.input<typeof caregiverHomeAddressSchema>
