import { z } from 'zod'

export const payRateReadSchema = z.object({
  caregiverIds: z.array(z.uuid()).max(5000).transform(ids => [...new Set(ids)]).optional(),
  agencyId: z.uuid().optional(),
  effectiveOn: z.iso.date().optional(),
  openOnly: z.boolean().default(false),
}).strict().refine(input => input.caregiverIds !== undefined || input.agencyId !== undefined, {
  message: 'A caregiver selection or agency is required',
})

export type PayRateReadInput = z.input<typeof payRateReadSchema>

export const payRateAmountSchema = z.number().finite().min(0).max(99999999.99)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use at most two decimal places')
export const payRateValueSchema = z.union([
  z.number(),
  z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Enter a non-negative amount with at most two decimal places'),
]).transform(Number).pipe(payRateAmountSchema)
export const payRateMutationSchema = z.object({
  caregiverMemberId: z.uuid(),
  payRate: payRateValueSchema,
  effectiveDate: z.iso.date().default(() => new Date().toISOString().slice(0,10)),
  serviceType: z.enum(['skilled','non_skilled']).nullable().default(null),
  unitType: z.enum(['hour','visit','15_min_unit']).default('hour'),
}).strict()
export const payRateBatchSchema = z.object({
  rates: z.array(payRateMutationSchema).min(1).max(500),
}).strict().superRefine((input, ctx) => {
  const seen = new Set<string>()
  input.rates.forEach((rate, i) => {
    const key = rate.caregiverMemberId + '/' + (rate.serviceType ?? '*')
    if (seen.has(key)) ctx.addIssue({ code:'custom',path:['rates',i,'payRate'],message:'Submit one change per caregiver and service type' })
    seen.add(key)
  })
})
export type PayRateMutationInput = z.input<typeof payRateMutationSchema>
export type PayRateMutation = z.output<typeof payRateMutationSchema>
export type PayRateBatchInput = z.input<typeof payRateBatchSchema>
export type PayRateBatch = z.output<typeof payRateBatchSchema>
