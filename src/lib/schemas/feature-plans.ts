import { z } from 'zod'
import { AGENCY_CAPABILITY_KEYS } from '@/lib/constants/feature-keys'

const capabilityKeySchema = z.enum(AGENCY_CAPABILITY_KEYS)

export const featurePlanInputSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required.').max(100),
  description: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000),
  capabilityKeys: z.array(capabilityKeySchema)
    .max(AGENCY_CAPABILITY_KEYS.length)
    .refine(keys => new Set(keys).size === keys.length, 'Each capability may be selected only once.'),
})

export const updateFeaturePlanInputSchema = featurePlanInputSchema.extend({
  planId: z.string().uuid(),
})

export const deleteFeaturePlanInputSchema = z.object({ planId: z.string().uuid() })

export const assignFeaturePlanInputSchema = z.object({
  agencyId: z.string().uuid(),
  planId: z.string().uuid().nullable(),
})

export type FeaturePlanInput = z.infer<typeof featurePlanInputSchema>
export type UpdateFeaturePlanInput = z.infer<typeof updateFeaturePlanInputSchema>
