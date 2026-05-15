'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { revalidatePath } from 'next/cache'

export interface HolidayEntry {
  name: string
  date: string          // ISO date: "2026-12-25"
  rate_multiplier: number
}

export interface AgencyConfigFormData {
  workWeekStart: number           // 0=Sun … 6=Sat
  allowWeekends: boolean
  weekendRateMultiplier: number | null
  fullTimeHoursPerWeek: number
  overtimeThresholdWeekly: number
  overtimeThresholdDaily: number | null
  overtimeRateMultiplier: number
  holidays: HolidayEntry[]
  mileageReimbursementEnabled: boolean
  mileageReimbursementStartDate: string | null  // ISO date or null
  mileageRatePerMile: number | null
}

export async function saveAgencyConfiguration(
  data: AgencyConfigFormData
): Promise<{ error: string | null }> {
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
    work_week_start: data.workWeekStart,
    allow_weekends: data.allowWeekends,
    weekend_rate_multiplier: data.weekendRateMultiplier ?? null,
    full_time_hours_per_week: data.fullTimeHoursPerWeek,
    overtime_threshold_weekly: data.overtimeThresholdWeekly,
    overtime_threshold_daily: data.overtimeThresholdDaily ?? null,
    overtime_rate_multiplier: data.overtimeRateMultiplier,
    holidays: data.holidays,
    mileage_reimbursement_enabled: data.mileageReimbursementEnabled,
    mileage_reimbursement_start_date: data.mileageReimbursementStartDate ?? null,
    mileage_rate_per_mile: data.mileageRatePerMile ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath('/pages/agency/configuration')
  return { error: null }
}
