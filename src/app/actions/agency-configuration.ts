'use server'

import { z } from 'zod'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { revalidatePath } from 'next/cache'
import { withBranchActor } from '@/lib/repositories/agency-branches'

/** Optional settings are fetched only when their configuration panel opens. */
export async function loadAgencyConfigurationAction() {
  try {
    return await withBranchActor(false, async actor => {
      const result = await q.getAgencyConfiguration(actor.agencyId)
      if (result.error) throw new Error('Unavailable')
      return { success: true as const, data: result.data }
    }, false)
  } catch { return { success: false as const, error: 'Unable to load configuration. Try again.' } }
}

export async function loadAgencyPipelineAction() {
  try {
    return await withBranchActor(true, async actor => {
      const result = await q.getAgencyLeadStages(actor.agencyId)
      if (result.error) throw new Error('Unavailable')
      if (result.data?.length) return { success: true as const, data: result.data }
      const seeded = await q.seedDefaultAgencyLeadStages(actor.agencyId)
      if (seeded.error) throw new Error('Unavailable')
      const audit = await q.insertAuditLog({ agency_id: actor.agencyId, table_name: 'agency_lead_stages', record_id: null,
        action: 'CREATE', performed_by_user_id: actor.id, details: { operation: 'seed_default_pipeline' } })
      if (audit.error) throw new Error('Unavailable')
      return { success: true as const, data: seeded.data ?? [] }
    }, false)
  } catch { return { success: false as const, error: 'Unable to load pipeline settings. Try again.' } }
}

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

  const { data: profile } = await q.getAgencyIdFromProfile(session.user.id)
  const agencyId = profile?.agency_id ?? null
  if (!agencyId) return { error: 'No agency found for this user' }

  const { error } = await q.upsertAgencyConfiguration(agencyId, {
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
