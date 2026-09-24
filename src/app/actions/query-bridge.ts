'use server'

import * as q from '@/lib/supabase/query'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import * as managerSchedules from '@/lib/repositories/manager-scheduling'

const AGENCY_MANAGE_ROLES = new Set(['admin', 'expert', 'agency_admin', 'company_owner', 'care_coordinator'])

export type {
  PatientAdlDayScheduleUpsert,
  PatientSkilledTaskDayScheduleUpsert,
  OnboardingToken,
  AgencyKeyStaff,
} from '@/lib/supabase/query'

export type { PatientLeadDetails } from '@/lib/supabase/query/leads'

// Shared helper — verifies Auth.js session and wraps the query in a Neon transaction
// with SET LOCAL session variables for RLS enforcement (Phase 4.5).
// Return type is Promise<T> so TypeScript inference at callers stays clean.
// Error cases use `as any` — runtime shape { data: null, error: string } is compatible
// with the { data: null, error: Error | null } shape all query functions return.
// The top-level catch handles infra failures (DB connection lost, set_config error)
// that the query functions' own try-catch cannot see.
async function ctx<T>(fn: () => Promise<T>, opts?: { allowedRoles?: Set<string> }): Promise<T> {
  const session = await getSession()
  if (!session) return { data: null, error: 'Unauthorized' } as any
  if (opts?.allowedRoles && !opts.allowedRoles.has(session.profile.role ?? '')) {
    return { data: null, error: 'Forbidden' } as any
  }
  try {
    return await withUserContext(
      session.user.id,
      session.profile.role ?? '',
      session.profile.agency_id ?? null,
      fn
    )
  } catch (err) {
    console.error('[query-bridge]', err)
    return { data: null, error: 'Internal error' } as any
  }
}

// ---------------------------------------------------------------------------
// Notifications / Messages
// ---------------------------------------------------------------------------

export async function deleteNotificationByIdAndUser(...args: Parameters<typeof q.deleteNotificationByIdAndUser>) {
  return q.deleteNotificationByIdAndUser(...args)
}

export async function getAgencyIdFromProfile(...args: Parameters<typeof q.getAgencyIdFromProfile>) {
  return ctx(() => q.getAgencyIdFromProfile(...args))
}

export async function getApplicationIdsByAgencyId(...args: Parameters<typeof q.getApplicationIdsByAgencyId>) {
  return ctx(() => q.getApplicationIdsByAgencyId(...args))
}

export async function getApplicationIdsByAssignedExpertId(...args: Parameters<typeof q.getApplicationIdsByAssignedExpertId>) {
  return ctx(() => q.getApplicationIdsByAssignedExpertId(...args))
}

export async function getConversationApplicationIds(...args: Parameters<typeof q.getConversationApplicationIds>) {
  return ctx(() => q.getConversationApplicationIds(...args))
}

export async function getConversationByApplicationId(...args: Parameters<typeof q.getConversationByApplicationId>) {
  return ctx(() => q.getConversationByApplicationId(...args))
}

export async function getConversationIds(...args: Parameters<typeof q.getConversationIds>) {
  return ctx(() => q.getConversationIds(...args))
}

export async function getConversationsWithApplicationByApplicationIds(...args: Parameters<typeof q.getConversationsWithApplicationByApplicationIds>) {
  return ctx(() => q.getConversationsWithApplicationByApplicationIds(...args))
}

export async function getConversationsWithApplications(...args: Parameters<typeof q.getConversationsWithApplications>) {
  return ctx(() => q.getConversationsWithApplications(...args))
}

export async function getUserProfileRoleById(...args: Parameters<typeof q.getUserProfileRoleById>) {
  return ctx(() => q.getUserProfileRoleById(...args))
}

export async function getUserProfilesByIds(...args: Parameters<typeof q.getUserProfilesByIds>) {
  return ctx(() => q.getUserProfilesByIds(...args))
}

export async function insertConversation(...args: Parameters<typeof q.insertConversation>) {
  return ctx(() => q.insertConversation(...args))
}

export async function insertMessage(...args: Parameters<typeof q.insertMessage>) {
  return ctx(() => q.insertMessage(...args))
}

export async function markConversationMessagesAsReadExceptSender(...args: Parameters<typeof q.markConversationMessagesAsReadExceptSender>) {
  return q.markConversationMessagesAsReadExceptSender(...args)
}

export async function markNotificationAsRead(...args: Parameters<typeof q.markNotificationAsRead>) {
  return q.markNotificationAsRead(...args)
}

export async function rpcCountUnreadMessagesForUser(...args: Parameters<typeof q.rpcCountUnreadMessagesForUser>) {
  return q.rpcCountUnreadMessagesForUser(...args)
}

export async function rpcGetTotalUnreadCountForUser(...args: Parameters<typeof q.rpcGetTotalUnreadCountForUser>) {
  return q.rpcGetTotalUnreadCountForUser(...args)
}

export async function getTotalMessageCountForUser(...args: Parameters<typeof q.getTotalMessageCountForUser>) {
  return q.getTotalMessageCountForUser(...args)
}

export async function rpcGetUnreadMessagesForUserInConversations(...args: Parameters<typeof q.rpcGetUnreadMessagesForUserInConversations>) {
  return q.rpcGetUnreadMessagesForUserInConversations(...args)
}

export async function rpcMarkMessageAsReadByUser(...args: Parameters<typeof q.rpcMarkMessageAsReadByUser>) {
  return q.rpcMarkMessageAsReadByUser(...args)
}

export async function rpcMarkMessagesAsReadByUser(...args: Parameters<typeof q.rpcMarkMessagesAsReadByUser>) {
  return q.rpcMarkMessagesAsReadByUser(...args)
}

export async function updateConversationLastMessageAt(...args: Parameters<typeof q.updateConversationLastMessageAt>) {
  return ctx(() => q.updateConversationLastMessageAt(...args))
}

export async function getMessagesByConversationId(...args: Parameters<typeof q.getMessagesByConversationId>) {
  return ctx(() => q.getMessagesByConversationId(...args))
}

export async function getUnreadNotificationItems(...args: Parameters<typeof q.getUnreadNotificationItems>) {
  return q.getUnreadNotificationItems(...args)
}

export async function getUnreadNotificationsByUserId(...args: Parameters<typeof q.getUnreadNotificationsByUserId>) {
  return q.getUnreadNotificationsByUserId(...args)
}

export async function getUnreadNotificationsCount(...args: Parameters<typeof q.getUnreadNotificationsCount>) {
  return q.getUnreadNotificationsCount(...args)
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function getApplicationForClose(...args: Parameters<typeof q.getApplicationForClose>) {
  return ctx(() => q.getApplicationForClose(...args))
}

export async function getApplicationAssignedExpertId(...args: Parameters<typeof q.getApplicationAssignedExpertId>) {
  return ctx(() => q.getApplicationAssignedExpertId(...args))
}

export async function getApplicationByAgencyAndExpert(...args: Parameters<typeof q.getApplicationByAgencyAndExpert>) {
  return ctx(() => q.getApplicationByAgencyAndExpert(...args))
}

export async function getApplicationDocumentsByApplicationId(...args: Parameters<typeof q.getApplicationDocumentsByApplicationId>) {
  return ctx(() => q.getApplicationDocumentsByApplicationId(...args))
}

export async function getApplicationsByAssignedExpertIdSelect(...args: Parameters<typeof q.getApplicationsByAssignedExpertIdSelect>) {
  return ctx(() => q.getApplicationsByAssignedExpertIdSelect(...args))
}

export async function getApplicationsListForDropdown(...args: Parameters<typeof q.getApplicationsListForDropdown>) {
  return ctx(() => q.getApplicationsListForDropdown(...args))
}

export async function getApplicationStepByAppAndId(...args: Parameters<typeof q.getApplicationStepByAppAndId>) {
  return ctx(() => q.getApplicationStepByAppAndId(...args))
}

export async function getApplicationStepByAppNameOrder(...args: Parameters<typeof q.getApplicationStepByAppNameOrder>) {
  return ctx(() => q.getApplicationStepByAppNameOrder(...args))
}

export async function getApplicationStepsByApplicationId(...args: Parameters<typeof q.getApplicationStepsByApplicationId>) {
  return ctx(() => q.getApplicationStepsByApplicationId(...args))
}

export async function getClientByCompanyOwnerId(...args: Parameters<typeof q.getClientByCompanyOwnerId>) {
  return ctx(() => q.getClientByCompanyOwnerId(...args))
}

export async function getMaxApplicationExpertStepOrder(...args: Parameters<typeof q.getMaxApplicationExpertStepOrder>) {
  return ctx(() => q.getMaxApplicationExpertStepOrder(...args))
}

export async function getRequirementDocumentsForDisplay(...args: Parameters<typeof q.getRequirementDocumentsForDisplay>) {
  return ctx(() => q.getRequirementDocumentsForDisplay(...args))
}

export async function getRequirementTemplatesForDisplay(...args: Parameters<typeof q.getRequirementTemplatesForDisplay>) {
  return ctx(() => q.getRequirementTemplatesForDisplay(...args))
}

export async function getStepsFromRequirement(...args: Parameters<typeof q.getStepsFromRequirement>) {
  return ctx(() => q.getStepsFromRequirement(...args))
}

export async function getUserProfileById(...args: Parameters<typeof q.getUserProfileById>) {
  return ctx(() => q.getUserProfileById(...args))
}

export async function insertApplication(...args: Parameters<typeof q.insertApplication>) {
  return ctx(() => q.insertApplication(...args))
}

export async function insertApplicationDocument(...args: Parameters<typeof q.insertApplicationDocument>) {
  return ctx(() => q.insertApplicationDocument(...args))
}

export async function insertApplicationStepRow(...args: Parameters<typeof q.insertApplicationStepRow>) {
  return ctx(() => q.insertApplicationStepRow(...args))
}

export async function insertApplicationStepsRows(...args: Parameters<typeof q.insertApplicationStepsRows>) {
  return ctx(() => q.insertApplicationStepsRows(...args))
}

export async function rpcCopyExpertStepsToApplication(...args: Parameters<typeof q.rpcCopyExpertStepsToApplication>) {
  return ctx(() => q.rpcCopyExpertStepsToApplication(...args))
}

export async function updateApplicationById(...args: Parameters<typeof q.updateApplicationById>) {
  return ctx(() => q.updateApplicationById(...args))
}

export async function updateApplicationDocumentReview(...args: Parameters<typeof q.updateApplicationDocumentReview>) {
  return ctx(() => q.updateApplicationDocumentReview(...args))
}

export async function updateApplicationDocumentStatus(...args: Parameters<typeof q.updateApplicationDocumentStatus>) {
  return ctx(() => q.updateApplicationDocumentStatus(...args))
}

export async function updateApplicationStatus(...args: Parameters<typeof q.updateApplicationStatus>) {
  return ctx(() => q.updateApplicationStatus(...args))
}

export async function updateApplicationStepComplete(...args: Parameters<typeof q.updateApplicationStepComplete>) {
  return ctx(() => q.updateApplicationStepComplete(...args))
}

export async function updateApplicationStepCompleteById(...args: Parameters<typeof q.updateApplicationStepCompleteById>) {
  return ctx(() => q.updateApplicationStepCompleteById(...args))
}

export async function getLatestApplicationDocumentByApplicationId(...args: Parameters<typeof q.getLatestApplicationDocumentByApplicationId>) {
  return ctx(() => q.getLatestApplicationDocumentByApplicationId(...args))
}

// ---------------------------------------------------------------------------
// Licenses / Requirements
// ---------------------------------------------------------------------------

export async function getConfigurationValuesWithSubcategories(...args: Parameters<typeof q.getConfigurationValuesWithSubcategories>) {
  return ctx(() => q.getConfigurationValuesWithSubcategories(...args))
}

export async function getDocumentsFromRequirement(...args: Parameters<typeof q.getDocumentsFromRequirement>) {
  return ctx(() => q.getDocumentsFromRequirement(...args))
}

export async function getLatestLicenseDocumentByLicenseId(...args: Parameters<typeof q.getLatestLicenseDocumentByLicenseId>) {
  return ctx(() => q.getLatestLicenseDocumentByLicenseId(...args))
}

export async function getLicenseRequirementByStateAndType(...args: Parameters<typeof q.getLicenseRequirementByStateAndType>) {
  return ctx(() => q.getLicenseRequirementByStateAndType(...args))
}

export async function getLicenseRequirementByStateAndTypeSingle(...args: Parameters<typeof q.getLicenseRequirementByStateAndTypeSingle>) {
  return ctx(() => q.getLicenseRequirementByStateAndTypeSingle(...args))
}

export async function getLicenseTypeById(...args: Parameters<typeof q.getLicenseTypeById>) {
  return ctx(() => q.getLicenseTypeById(...args))
}

export async function getLicenseTypeByIdFull(...args: Parameters<typeof q.getLicenseTypeByIdFull>) {
  return ctx(() => q.getLicenseTypeByIdFull(...args))
}

export async function getLicenseTypes(...args: Parameters<typeof q.getLicenseTypes>) {
  return ctx(() => q.getLicenseTypes(...args))
}

export async function getRegularStepsFromRequirement(...args: Parameters<typeof q.getRegularStepsFromRequirement>) {
  return ctx(() => q.getRegularStepsFromRequirement(...args))
}

export async function getRequirementCounts(...args: Parameters<typeof q.getRequirementCounts>) {
  return ctx(() => q.getRequirementCounts(...args))
}

export async function getStandalonePlaybooksByState(...args: Parameters<typeof q.getStandalonePlaybooksByState>) {
  return ctx(() => q.getStandalonePlaybooksByState(...args))
}

export async function getTemplatesFromRequirement(...args: Parameters<typeof q.getTemplatesFromRequirement>) {
  return ctx(() => q.getTemplatesFromRequirement(...args))
}

export async function insertLicenseDocument(...args: Parameters<typeof q.insertLicenseDocument>) {
  return ctx(() => q.insertLicenseDocument(...args))
}

export async function insertLicenseReturning(...args: Parameters<typeof q.insertLicenseReturning>) {
  return ctx(() => q.insertLicenseReturning(...args))
}

export async function updateLicenseById(...args: Parameters<typeof q.updateLicenseById>) {
  return ctx(() => q.updateLicenseById(...args))
}

// ---------------------------------------------------------------------------
// Patients / Schedules / ADLs
// ---------------------------------------------------------------------------

export async function deleteAdl(...args: Parameters<typeof q.deleteAdl>) {
  return ctx(() => q.deleteAdl(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function deleteIncident(...args: Parameters<typeof q.deleteIncident>) {
  return ctx(() => q.deleteIncident(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function deletePatientContractedHours(...args: Parameters<typeof q.deletePatientContractedHours>) {
  return q.deletePatientContractedHours(...args)
}

export async function deletePatientServiceContract(...args: Parameters<typeof q.deletePatientServiceContract>) {
  return q.deletePatientServiceContract(...args)
}

export async function deleteRepresentative(...args: Parameters<typeof q.deleteRepresentative>) {
  return ctx(() => q.deleteRepresentative(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function deleteSchedule(...args: Parameters<typeof q.deleteSchedule>) {
  return managerSchedules.managerDeleteSchedule(...args)
}

export async function deleteSkilledTaskPlanRowsBatch(...args: Parameters<typeof q.deleteSkilledTaskPlanRowsBatch>) {
  return ctx(() => q.deleteSkilledTaskPlanRowsBatch(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function getAdlsByPatientId(...args: Parameters<typeof q.getAdlsByPatientId>) {
  return ctx(() => q.getAdlsByPatientId(...args))
}

export async function getCaregiverAvailabilitySlotsByCaregiverIds(...args: Parameters<typeof q.getCaregiverAvailabilitySlotsByCaregiverIds>) {
  return ctx(() => q.getCaregiverAvailabilitySlotsByCaregiverIds(...args))
}

export async function getCaregiverRequirementsByPatientId(...args: Parameters<typeof q.getCaregiverRequirementsByPatientId>) {
  return ctx(() => q.getCaregiverRequirementsByPatientId(...args))
}

export async function getCaregiverSkillCatalogFromTaskRequirements(...args: Parameters<typeof q.getCaregiverSkillCatalogFromTaskRequirements>) {
  return q.getCaregiverSkillCatalogFromTaskRequirements(...args)
}

export async function getClientsByExpertId(...args: Parameters<typeof q.getClientsByExpertId>) {
  return ctx(() => q.getClientsByExpertId(...args))
}

export async function getPatientAdlDaySchedulesByPatientId(...args: Parameters<typeof q.getPatientAdlDaySchedulesByPatientId>) {
  return ctx(() => q.getPatientAdlDaySchedulesByPatientId(...args))
}

export async function getPatientServiceContractsByPatientId(...args: Parameters<typeof q.getPatientServiceContractsByPatientId>) {
  return q.getPatientServiceContractsByPatientId(...args)
}

export async function getPatientSkilledCarePlanTasks(...args: Parameters<typeof q.getPatientSkilledCarePlanTasks>) {
  return ctx(() => q.getPatientSkilledCarePlanTasks(...args))
}

export async function getPatientSkilledDaySchedulesByPatientId(...args: Parameters<typeof q.getPatientSkilledDaySchedulesByPatientId>) {
  return ctx(() => q.getPatientSkilledDaySchedulesByPatientId(...args))
}

export async function getScheduledVisitsAsScheduleRowsForAgencyAndDateRange(...args: Parameters<typeof q.getScheduledVisitsAsScheduleRowsForAgencyAndDateRange>) {
  return managerSchedules.managerGetSchedulesByAgencyAndRange(...args)
}

export async function getSchedulesByPatientId(...args: Parameters<typeof q.getSchedulesByPatientId>) {
  return managerSchedules.managerGetSchedulesByPatient(...args)
}

export async function getSchedulesByPatientIdAndDateRange(...args: Parameters<typeof q.getSchedulesByPatientIdAndDateRange>) {
  return managerSchedules.managerGetSchedulesByPatientAndRange(...args)
}

export async function getTaskCatalogAdlLists(...args: Parameters<typeof q.getTaskCatalogAdlLists>) {
  return ctx(() => q.getTaskCatalogAdlLists(...args))
}

export async function getTaskCatalogSkilledTasks(...args: Parameters<typeof q.getTaskCatalogSkilledTasks>) {
  return ctx(() => q.getTaskCatalogSkilledTasks(...args))
}

export async function insertAdls(...args: Parameters<typeof q.insertAdls>) {
  return ctx(() => q.insertAdls(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function insertIncident(...args: Parameters<typeof q.insertIncident>) {
  return ctx(() => q.insertIncident(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function insertPatient(...args: Parameters<typeof q.insertPatient>) {
  return ctx(() => q.insertPatient(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function insertPatientAddress(...args: Parameters<typeof q.insertPatientAddress>) {
  return ctx(() => q.insertPatientAddress(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function insertPatientContractedHours(...args: Parameters<typeof q.insertPatientContractedHours>) {
  return q.insertPatientContractedHours(...args)
}

export async function insertPatientServiceContract(...args: Parameters<typeof q.insertPatientServiceContract>) {
  return q.insertPatientServiceContract(...args)
}

export async function insertRecurringSchedulesFromSeries(...args: Parameters<typeof q.insertRecurringSchedulesFromSeries>) {
  return managerSchedules.managerInsertRecurringSchedules(...args)
}

export async function insertRepresentative(...args: Parameters<typeof q.insertRepresentative>) {
  return ctx(() => q.insertRepresentative(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function insertSchedule(...args: Parameters<typeof q.insertSchedule>) {
  return managerSchedules.managerInsertSchedule(...args)
}

export async function updateIncident(...args: Parameters<typeof q.updateIncident>) {
  return ctx(() => q.updateIncident(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function updatePatient(...args: Parameters<typeof q.updatePatient>) {
  return ctx(() => q.updatePatient(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function updatePatientAdlDaySchedule(...args: Parameters<typeof q.updatePatientAdlDaySchedule>) {
  return ctx(() => q.updatePatientAdlDaySchedule(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function updatePatientLoginAccess(...args: Parameters<typeof q.updatePatientLoginAccess>) {
  return ctx(() => q.updatePatientLoginAccess(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function updatePatientMedical(...args: Parameters<typeof q.updatePatientMedical>) {
  return ctx(() => q.updatePatientMedical(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function updatePatientServiceContractDetails(...args: Parameters<typeof q.updatePatientServiceContractDetails>) {
  return q.updatePatientServiceContractDetails(...args)
}

export async function updatePatientServiceContractStatus(...args: Parameters<typeof q.updatePatientServiceContractStatus>) {
  return q.updatePatientServiceContractStatus(...args)
}

export async function updatePatientSkilledTaskDayScheduleNote(...args: Parameters<typeof q.updatePatientSkilledTaskDayScheduleNote>) {
  return ctx(() => q.updatePatientSkilledTaskDayScheduleNote(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function updatePatientStatus(...args: Parameters<typeof q.updatePatientStatus>) {
  return ctx(() => q.updatePatientStatus(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function updateRecurringSchedulesByScope(...args: Parameters<typeof q.updateRecurringSchedulesByScope>) {
  return managerSchedules.managerUpdateRecurringSchedules(...args)
}

export async function updateRepresentative(...args: Parameters<typeof q.updateRepresentative>) {
  return ctx(() => q.updateRepresentative(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function updateSchedule(...args: Parameters<typeof q.updateSchedule>) {
  return managerSchedules.managerUpdateSchedule(...args)
}

export async function upsertPatientAdlDaySchedulesBatch(...args: Parameters<typeof q.upsertPatientAdlDaySchedulesBatch>) {
  return ctx(() => q.upsertPatientAdlDaySchedulesBatch(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

export async function upsertPatientSkilledTaskDaySchedulesBatch(...args: Parameters<typeof q.upsertPatientSkilledTaskDaySchedulesBatch>) {
  return ctx(() => q.upsertPatientSkilledTaskDaySchedulesBatch(...args), { allowedRoles: AGENCY_MANAGE_ROLES })
}

// ---------------------------------------------------------------------------
// Staff / Agencies
// ---------------------------------------------------------------------------

export async function getAgencyDocuments(...args: Parameters<typeof q.getAgencyDocuments>) {
  return ctx(() => q.getAgencyDocuments(...args))
}

export async function getAgencyNameById(...args: Parameters<typeof q.getAgencyNameById>) {
  return ctx(() => q.getAgencyNameById(...args))
}

export async function getAgencyNotes(...args: Parameters<typeof q.getAgencyNotes>) {
  return ctx(() => q.getAgencyNotes(...args))
}

export async function getClientById(...args: Parameters<typeof q.getClientById>) {
  return ctx(() => q.getClientById(...args))
}

export async function getLeadNotesByLeadIds(...args: Parameters<typeof q.getLeadNotesByLeadIds>) {
  return ctx(() => q.getLeadNotesByLeadIds(...args))
}

export async function getLicensingExpertByUserId(...args: Parameters<typeof q.getLicensingExpertByUserId>) {
  return ctx(() => q.getLicensingExpertByUserId(...args))
}

export async function insertStaffMemberReturning(...args: Parameters<typeof q.insertStaffMemberReturning>) {
  return ctx(() => q.insertStaffMemberReturning(...args))
}

export async function updateClientById(...args: Parameters<typeof q.updateClientById>) {
  return ctx(() => q.updateClientById(...args))
}

export async function updateLicensingExpertById(...args: Parameters<typeof q.updateLicensingExpertById>) {
  return ctx(() => q.updateLicensingExpertById(...args))
}

export async function updateStaffMember(...args: Parameters<typeof q.updateStaffMember>) {
  return ctx(() => q.updateStaffMember(...args))
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getUserProfileFull(...args: Parameters<typeof q.getUserProfileFull>) {
  return ctx(() => q.getUserProfileFull(...args))
}

export async function updateUserProfile(...args: Parameters<typeof q.updateUserProfile>) {
  return ctx(() => q.updateUserProfile(...args))
}
