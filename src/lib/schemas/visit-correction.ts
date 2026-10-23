import { z } from 'zod'

const reason = z.string().trim().min(10, 'Explain why the visit is being corrected.').max(2000)
const actualTime = z.iso.datetime({ offset: true })
const hours = z.number().finite().min(0).max(744)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    'Use at most two decimal places.')

export const completeVisitCorrectionSchema = z.object({
    scheduledVisitId: z.uuid(),
    expectedStatus: z.literal('missed'),
    correctedStatus: z.literal('completed'),
    caregiverMemberId: z.uuid(),
    actualStartAt: actualTime,
    actualEndAt: actualTime,
    billableHours: hours,
    reason,
    careVerified: z.literal(true, { error: 'Confirm that care actually occurred.' }),
  }).strict().refine(value => Date.parse(value.actualEndAt) > Date.parse(value.actualStartAt), {
    path: ['actualEndAt'],
    message: 'Actual end time must follow actual start time.',
  })

export const missedVisitCorrectionSchema = z.object({
    scheduledVisitId: z.uuid(),
    expectedStatus: z.literal('completed'),
    correctedStatus: z.literal('missed'),
    reason,
  }).strict()

export const visitCorrectionSchema = z.discriminatedUnion('correctedStatus', [
  completeVisitCorrectionSchema,
  missedVisitCorrectionSchema,
])

export type VisitCorrectionInput = z.input<typeof visitCorrectionSchema>
export type CompleteVisitCorrectionInput = z.input<typeof completeVisitCorrectionSchema>
export type MissedVisitCorrectionInput = z.input<typeof missedVisitCorrectionSchema>
