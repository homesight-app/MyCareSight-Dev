import { z } from 'zod'
import { staffMemberSchema } from '@/lib/schemas/staff-member'
import { emailZodField } from '@/lib/validation'
import { payRateValueSchema } from '@/lib/schemas/caregiver-pay-rates'

export const caregiverEditSchema = staffMemberSchema.extend({
  email: emailZodField,
  start_date: z.union([z.literal(''),z.iso.date()]).optional(),
  pay_rate_hourly: z.string().optional().refine(
    value => !value?.trim() || payRateValueSchema.safeParse(value).success,
    'Enter a non-negative amount with at most two decimal places'
  ),
  pay_rate_effective_date: z.union([z.literal(''),z.iso.date()]).optional(),
}).strict()
export type CaregiverEditInput = z.infer<typeof caregiverEditSchema>
