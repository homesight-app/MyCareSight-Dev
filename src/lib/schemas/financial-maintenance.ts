import { z } from 'zod'

const twoDecimalNonnegative = (label: string, maximum: number) => z.number({ error: `${label} must be a number` }).finite()
  .min(0, `${label} cannot be negative`)
  .max(maximum, `${label} is too large`)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    `${label} must use at most two decimal places`)

export const billRateChangeSchema = z.object({
  contractId: z.uuid(),
  billRate: twoDecimalNonnegative('Bill rate', 1_000_000),
}).strict()

export const billRateBatchSchema = z.object({
  rates: z.array(billRateChangeSchema).min(1, 'Select at least one changed rate').max(100),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  value.rates.forEach((rate, index) => {
    if (seen.has(rate.contractId)) context.addIssue({
      code: 'custom', path: ['rates', index, 'contractId'], message: 'Duplicate contract',
    })
    seen.add(rate.contractId)
  })
})

export const visitMileageSchema = z.object({
  scheduledVisitId: z.uuid(),
  mileageMiles: twoDecimalNonnegative('Mileage', 100_000).nullable(),
}).strict()

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
export const financialReportRangeSchema = z.object({
  dateFrom: dateOnly,
  dateTo: dateOnly,
}).strict().refine(value => value.dateFrom <= value.dateTo, {
  path: ['dateTo'], message: 'End date must be on or after start date',
})

export type BillRateBatchInput = z.input<typeof billRateBatchSchema>
export type VisitMileageInput = z.input<typeof visitMileageSchema>
