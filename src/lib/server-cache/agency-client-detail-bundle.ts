import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'

async function loadAgencyClientDetailBundleUncached(patientId: string, viewerUserId: string) {
  const supabase = createAdminClient()

  const { data: up } = await q.getAgencyIdFromProfile(supabase, viewerUserId)
  const agencyId = up?.agency_id ?? null
  if (!agencyId) return null

  const { data: client } = await q.getPatientByIdAndAgencyId(supabase, patientId, agencyId)
  if (!client) return null

  const agencyClient = null

  const { data: allClients } = await q.getPatientsByAgencyIdMinimal(supabase, agencyId)

  let representativesList: Awaited<ReturnType<typeof q.getRepresentativesByPatientId>>['data'] = []
  try {
    const res = await q.getRepresentativesByPatientId(supabase, patientId)
    representativesList = res.data ?? []
  } catch {
    representativesList = []
  }

  let caregiverRequirements: Awaited<ReturnType<typeof q.getCaregiverRequirementsByPatientId>>['data'] = null
  try {
    const res = await q.getCaregiverRequirementsByPatientId(supabase, patientId)
    caregiverRequirements = res.data ?? null
  } catch {
    caregiverRequirements = null
  }

  let incidentsList: Awaited<ReturnType<typeof q.getIncidentsByPatientId>>['data'] = []
  try {
    const res = await q.getIncidentsByPatientId(supabase, patientId)
    incidentsList = res.data ?? []
  } catch {
    incidentsList = []
  }

  let adlsList: Awaited<ReturnType<typeof q.getAdlsByPatientId>>['data'] = []
  let adlSchedulesList: Awaited<ReturnType<typeof q.getPatientAdlDaySchedulesByPatientId>>['data'] = []
  try {
    const [adlsRes, schedulesRes] = await Promise.all([
      q.getAdlsByPatientId(supabase, patientId),
      q.getPatientAdlDaySchedulesByPatientId(supabase, patientId),
    ])
    adlsList = adlsRes.data ?? []
    adlSchedulesList = schedulesRes.data ?? []
  } catch {
    adlsList = []
    adlSchedulesList = []
  }

  let staffList: Awaited<ReturnType<typeof q.getStaffMembersByAgencyId>>['data'] = []
  const staffRes = await q.getStaffMembersByAgencyId(supabase, agencyId, { status: 'active' })
  staffList = staffRes.data ?? []

  let contractedHoursList: Awaited<ReturnType<typeof q.getPatientContractedHoursByPatientId>>['data'] = []
  try {
    const res = await q.getPatientContractedHoursByPatientId(supabase, patientId)
    contractedHoursList = res.data ?? []
  } catch {
    contractedHoursList = []
  }

  let serviceContracts: Awaited<ReturnType<typeof q.getPatientServiceContractsByPatientId>>['data'] = []
  try {
    const res = await q.getPatientServiceContractsByPatientId(supabase, patientId)
    serviceContracts = res.data ?? []
  } catch {
    serviceContracts = []
  }

  let skilledCarePlanTasks: Awaited<ReturnType<typeof q.getPatientSkilledCarePlanTasks>>['data'] = []
  let skilledSchedulesList: Awaited<ReturnType<typeof q.getPatientSkilledDaySchedulesByPatientId>>['data'] = []
  try {
    const [tasksRes, schedRes] = await Promise.all([
      q.getPatientSkilledCarePlanTasks(supabase, patientId),
      q.getPatientSkilledDaySchedulesByPatientId(supabase, patientId),
    ])
    skilledCarePlanTasks = tasksRes.data ?? []
    skilledSchedulesList = schedRes.data ?? []
  } catch {
    skilledCarePlanTasks = []
    skilledSchedulesList = []
  }

  return {
    client,
    allClients: allClients ?? [],
    representativesList,
    caregiverRequirements,
    incidentsList,
    adlsList,
    adlSchedulesList,
    staffList,
    contractedHoursList,
    serviceContracts,
    skilledCarePlanTasks,
    skilledSchedulesList,
  }
}

/**
 * Patient detail payload for the agency client page (viewer + patient scoped in the loader).
 *
 * Previously wrapped in `unstable_cache` with a TTL; that could return stale incidents / profile fields
 * after `router.refresh()` until the TTL expired, which looked like “data only appears after a hard reload”.
 * This loader always reads current DB state so client-side saves + `router.refresh()` stay consistent.
 */
export function getCachedAgencyClientDetailBundle(patientId: string, viewerUserId: string) {
  return loadAgencyClientDetailBundleUncached(patientId, viewerUserId)
}
