import { z } from 'zod'

const hours = z.number().finite().min(0, 'Hours cannot be negative').max(744, 'Hours are too large')
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use at most two decimal places')

export const timeBillingDecisionSchema = z.object({
  scheduledVisitId: z.uuid(),
  actualHours: hours,
  billableHours: hours,
  note: z.string().trim().max(9000, 'Note is too long'),
  serviceType: z.enum(['non_skilled','skilled']),
  decision: z.enum(['approved','voided']),
}).strict()

export type TimeBillingDecisionInput = z.input<typeof timeBillingDecisionSchema>

