import { z } from 'zod'
import { phoneZodField, optionalEmailZodField } from '@/lib/validation'

export const leadFormSchema = z.object({
  contactFirstName: z.string().min(1, 'First name is required'),
  contactLastName: z.string().min(1, 'Last name is required'),
  contactEmail: optionalEmailZodField,
  contactPhone: phoneZodField,
  companyName: z.string().optional(),
  serviceType: z.string().optional(),
  stage: z.string(),
  source: z.string(),
  price: z.string().optional(),
  retainerAmount: z.string().optional(),
  retainerPaidDate: z.string().optional(),
  installments: z.string().optional(),
  installmentAmount: z.string().optional(),
  signedDate: z.string().optional(),
  notes: z.string().optional(),
  leadOwnerId: z.string().optional(),
})

export type LeadFormData = z.infer<typeof leadFormSchema>
