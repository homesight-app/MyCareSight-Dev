import { z } from 'zod'

const uuid = z.uuid()

export const publishVisitShiftOfferSchema = z
  .object({
    visitId: uuid,
    audienceMode: z.enum(['selected', 'all_eligible']),
    caregiverIds: z.array(uuid).max(200, 'Select no more than 200 caregivers at once.'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.audienceMode === 'selected' && value.caregiverIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['caregiverIds'],
        message: 'Select at least one eligible caregiver.',
      })
    }
  })

export const respondToVisitShiftOfferSchema = z
  .object({
    offerId: uuid,
    response: z.enum(['interested', 'not_interested']),
    caregiverNote: z.string().trim().max(1000, 'Keep the note under 1,000 characters.').nullable().optional(),
  })
  .strict()

export type PublishVisitShiftOfferInput = z.input<typeof publishVisitShiftOfferSchema>
export type RespondToVisitShiftOfferInput = z.input<typeof respondToVisitShiftOfferSchema>
