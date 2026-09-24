import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().max(max).optional().default('')

export const publicContactSchema = z.object({
  website: optionalText(200),
  turnstileToken: z.string().min(1).max(4096),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: optionalText(40),
  company: optionalText(200),
  bestTime: optionalText(200),
  message: optionalText(5000),
  serviceType: optionalText(100),
  smsConsent: z.enum(['yes', 'no']),
  address1: optionalText(300),
  address2: optionalText(300),
  city: optionalText(150),
  state: optionalText(10),
  zip: optionalText(20),
})

export type PublicContactInput = z.infer<typeof publicContactSchema>
