import { z } from 'zod'
import { US_PHONE_REGEX } from '@/lib/validation'

const optionalText = (max: number) => z.string().trim().max(max).optional().default('')

export const websiteLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: optionalText(40).refine(value => !value || US_PHONE_REGEX.test(value), 'Invalid phone number'),
  companyName: optionalText(200),
  serviceType: z.enum(['companion', 'personal_care', 'skilled_nursing', 'therapy', 'other']).optional(),
  message: optionalText(5000),
  smsConsent: z.boolean().optional().default(false),
  address1: optionalText(300),
  address2: optionalText(300),
  city: optionalText(150),
  state: optionalText(10),
  zip: optionalText(20),
}).strict()

export const leadIntegrationIdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)

export const createLeadIntegrationCredentialSchema = z.object({
  agencyId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name is required').max(100),
})

export const revokeLeadIntegrationCredentialSchema = z.object({
  agencyId: z.string().uuid(),
  credentialId: z.string().uuid(),
})

export type WebsiteLeadInput = z.infer<typeof websiteLeadSchema>
export type CreateLeadIntegrationCredentialInput = z.infer<typeof createLeadIntegrationCredentialSchema>
