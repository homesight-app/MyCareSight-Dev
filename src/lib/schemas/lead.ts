import { z } from 'zod'
import { phoneZodField, optionalEmailZodField } from '@/lib/validation'

export const leadFormSchema = z.object({
  contactFirstName: z.string().min(1, 'First name is required'),
  contactLastName: z.string().min(1, 'Last name is required'),
  contactEmail: optionalEmailZodField,
  contactPhone: phoneZodField,
  companyName: z.string().optional(),
  serviceType: z.string().optional(),
  branchId: z.uuid('Choose a valid branch').optional(),
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
  // Patient-context fields (optional, only submitted when leadType === 'patient')
  pocName: z.string().optional(),
  pocPhone: phoneZodField,
  pocRelationship: z.string().optional(),
  startDate: z.string().optional(),
})

export type LeadFormData = z.infer<typeof leadFormSchema>

/** The same field rules at the server boundary, with the existing numeric API shape. */
export const leadUpdateSchema = leadFormSchema.pick({ contactFirstName: true, contactLastName: true,
  contactEmail: true, contactPhone: true, companyName: true, serviceType: true, branchId: true,
  notes: true, source: true, leadOwnerId: true }).partial().extend({
  notes: z.string().nullable().optional(), source: z.string().nullable().optional(),
  leadOwnerId: z.uuid().nullable().optional(), assignedTo: z.uuid().nullable().optional(),
  convertedAgencyId: z.uuid().nullable().optional(),
  price: z.number().finite().nullable().optional(), retainerAmount: z.number().finite().nullable().optional(),
  installments: z.number().int().nullable().optional(), installmentAmount: z.number().finite().nullable().optional(),
  retainerPaidDate: z.string().nullable().optional(), signedDate: z.string().nullable().optional(),
  proposalSentDate: z.string().nullable().optional(), serviceStates: z.array(z.string()).nullable().optional(),
})

export const leadCreateSchema = leadUpdateSchema.omit({ branchId: true }).extend({
  leadType: z.enum(['agency', 'patient']), agencyId: z.uuid().optional(),
  contactFirstName: leadFormSchema.shape.contactFirstName, contactLastName: leadFormSchema.shape.contactLastName,
  stage: z.string().optional(), notes: z.string().optional(), source: z.string().optional(),
})
