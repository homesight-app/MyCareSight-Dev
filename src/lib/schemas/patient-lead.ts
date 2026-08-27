import { z } from 'zod'
import { phoneZodField } from '@/lib/validation'

export const patientLeadDetailsSchema = z.object({
  pocName: z.string().optional(),
  pocPhone: phoneZodField,
  pocRelationship: z.string().optional(),
  pocEmail: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  reasonForCare: z.string().optional(),
  mobilityStatus: z.string().optional(),
  cognitiveStatus: z.string().optional(),
  medicalConditions: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  startDate: z.string().optional(),
  scheduleType: z.string().optional(),
  livingSituation: z.string().optional(),
  paymentMethod: z.string().optional(),
  insuranceCarrier: z.string().optional(),
  insurancePolicyNumber: z.string().optional(),
})

export type PatientLeadDetailsFormData = z.infer<typeof patientLeadDetailsSchema>
