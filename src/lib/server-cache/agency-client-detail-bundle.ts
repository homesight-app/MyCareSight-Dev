import * as q from '@/lib/supabase/query'

export type AgencyClientDetailTab =
  | 'overview'
  | 'medical'
  | 'representatives'
  | 'documents'
  | 'caregiver-requirements'
  | 'incidents'
  | 'notes'
  | 'schedule'
  | 'adls'
  | 'skilled-tasks'

const VALID_TABS = new Set<AgencyClientDetailTab>([
  'overview', 'medical', 'representatives', 'documents', 'caregiver-requirements',
  'incidents', 'notes', 'schedule', 'adls', 'skilled-tasks',
])

export function normalizeAgencyClientDetailTab(value: string | null | undefined): AgencyClientDetailTab {
  return VALID_TABS.has(value as AgencyClientDetailTab) ? value as AgencyClientDetailTab : 'overview'
}

async function dataOrThrow<T>(
  request: Promise<{ data: T | null; error?: unknown }>,
  fallback: T,
): Promise<T> {
  const result = await request
  if (result.error) throw result.error
  return result.data ?? fallback
}

async function loadAgencyClientDetailBundleUncached(
  patientId: string,
  viewerUserId: string,
  requestedTab: AgencyClientDetailTab,
) {
  const profile = await dataOrThrow(q.getAgencyIdFromProfile(viewerUserId), null)
  const agencyId = profile?.agency_id ?? null
  if (!agencyId) return null

  const client = await dataOrThrow(q.getPatientByIdAndAgencyId(patientId, agencyId), null)
  if (!client) return null

  const needsAdls = requestedTab === 'adls' || requestedTab === 'schedule'
  const needsSkilled = requestedTab === 'skilled-tasks' || requestedTab === 'schedule'

  const [
    allClients,
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
  ] = await Promise.all([
    dataOrThrow(q.getPatientsByAgencyIdMinimal(agencyId), []),
    requestedTab === 'representatives'
      ? dataOrThrow(q.getRepresentativesByPatientId(patientId), [])
      : Promise.resolve([]),
    requestedTab === 'caregiver-requirements'
      ? dataOrThrow(q.getCaregiverRequirementsByPatientId(patientId), null)
      : Promise.resolve(null),
    requestedTab === 'incidents'
      ? dataOrThrow(q.getIncidentsByPatientId(patientId), [])
      : Promise.resolve([]),
    needsAdls ? dataOrThrow(q.getAdlsByPatientId(patientId), []) : Promise.resolve([]),
    needsAdls ? dataOrThrow(q.getPatientAdlDaySchedulesByPatientId(patientId), []) : Promise.resolve([]),
    requestedTab === 'schedule'
      ? dataOrThrow(q.getStaffMembersByAgencyId(agencyId, { status: 'active' }), [])
      : Promise.resolve([]),
    dataOrThrow(q.getPatientContractedHoursByPatientId(patientId), []),
    dataOrThrow(q.getPatientServiceContractsByPatientId(patientId), []),
    needsSkilled ? dataOrThrow(q.getPatientSkilledCarePlanTasks(patientId), []) : Promise.resolve([]),
    needsSkilled ? dataOrThrow(q.getPatientSkilledDaySchedulesByPatientId(patientId), []) : Promise.resolve([]),
  ])

  return {
    client,
    allClients,
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

/** Current, patient-scoped payload with tab-specific related data. */
export function getCachedAgencyClientDetailBundle(
  patientId: string,
  viewerUserId: string,
  requestedTab: AgencyClientDetailTab,
) {
  return loadAgencyClientDetailBundleUncached(patientId, viewerUserId, requestedTab)
}
