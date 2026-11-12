import { z } from 'zod'
import { optionalEmailZodField, phoneZodField } from '@/lib/validation'

export const patientLeadDetailsSchema = z.object({
  pocName: z.string().optional(),
  pocPhone: phoneZodField,
  pocRelationship: z.string().optional(),
  pocEmail: optionalEmailZodField,
  startDate: z.string().optional(),
})

export type PatientLeadDetailsFormData = z.infer<typeof patientLeadDetailsSchema>

export const leadConversionSchema = z.object({
  leadId: z.string().uuid('Invalid lead'),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  phone: phoneZodField,
  email: optionalEmailZodField,
  streetAddress: z.string().trim().max(250).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(2).optional(),
  zipCode: z.string().trim().max(10).optional(),
  confirmPossibleDuplicate: z.boolean().optional().default(false),
})

export type LeadConversionFormData = z.infer<typeof leadConversionSchema>
