'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { revalidatePath } from 'next/cache'

const holidaySchema = z.object({
  name: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Holiday date must be YYYY-MM-DD'),
  rate_multiplier: z.number().min(1),
})

const agencyConfigSchema = z.object({
  workWeekStart: z.number().int().min(0).max(6),
  allowWeekends: z.boolean(),
  weekendRateMultiplier: z.number().nullable(),
  fullTimeHoursPerWeek: z.number().min(1).max(168),
  overtimeThresholdWeekly: z.number().min(0),
  overtimeThresholdDaily: z.number().nullable(),
  overtimeRateMultiplier: z.number().min(1),
  holidays: z.array(holidaySchema),
  mileageReimbursementEnabled: z.boolean(),
  mileageReimbursementStartDate: z.string().nullable(),
  mileageRatePerMile: z.number().nullable(),
})

export type HolidayEntry = z.infer<typeof holidaySchema>
export type AgencyConfigFormData = z.infer<typeof agencyConfigSchema>

export async function saveAgencyConfiguration(
  data: AgencyConfigFormData
): Promise<{ error: string | null }> {
  const parsed = agencyConfigSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid configuration' }
  const validData = parsed.data
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') {
    return { error: 'Forbidden' }
  }

  const supabase = await createClient()

  const { data: profile } = await q.getAgencyIdFromProfile(supabase, session.user.id)
  const agencyId = profile?.agency_id ?? null
  if (!agencyId) return { error: 'No agency found for this user' }

  const { error } = await q.upsertAgencyConfiguration(supabase, agencyId, {
    work_week_start: validData.workWeekStart,
    allow_weekends: validData.allowWeekends,
    weekend_rate_multiplier: validData.weekendRateMultiplier ?? null,
    full_time_hours_per_week: validData.fullTimeHoursPerWeek,
    overtime_threshold_weekly: validData.overtimeThresholdWeekly,
    overtime_threshold_daily: validData.overtimeThresholdDaily ?? null,
    overtime_rate_multiplier: validData.overtimeRateMultiplier,
    holidays: validData.holidays,
    mileage_reimbursement_enabled: validData.mileageReimbursementEnabled,
    mileage_reimbursement_start_date: validData.mileageReimbursementStartDate ?? null,
    mileage_rate_per_mile: validData.mileageRatePerMile ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath('/pages/agency/configuration')
  return { error: null }
}
