import { z } from 'zod'
import { normalizeUSState, US_STATES } from '@/lib/constants'

/** Optional address state, normalized to the same names used by the dropdown. */
export const usStateField = z.string().trim().max(100)
  .transform(normalizeUSState)
  .refine(value => value === '' || US_STATES.includes(value), 'Select a valid state')
