import type { Supabase } from '../types'

const APPLICATIONS_COLUMNS = 'id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id'
const APPLICATION_STEPS_COLUMNS = 'id, application_id, step_name, step_order, is_completed, completed_at, completed_by, notes, created_at, updated_at, is_expert_step, created_by_expert_id, description, phase, instructions'
const APPLICATION_DOCUMENTS_COLUMNS = 'id, application_id, document_name, document_url, document_type, status, created_at, description, expert_review_notes, license_requirement_document_id'

/** Fetch application by id for close check (id, progress_percentage, status). */
export async function getApplicationForClose(supabase: Supabase, applicationId: string) {
  return supabase
    .from('applications')
    .select('id, progress_percentage, status')
    .eq('id', applicationId)
    .single()
}

/** Get application license_type_id, state, status by id. */
export async function getApplicationLicenseTypeState(supabase: Supabase, applicationId: string) {
  return supabase
    .from('applications')
    .select('license_type_id, state, status')
    .eq('id', applicationId)
    .single()
}

/** Get application assigned_expert_id, application_name, company_owner_id by id. */
export async function getApplicationExpertAndOwner(supabase: Supabase, applicationId: string) {
  return supabase
    .from('applications')
    .select('assigned_expert_id, application_name, company_owner_id')
    .eq('id', applicationId)
    .single()
}

/** Set application status to closed and last_updated_date. */
export async function closeApplicationUpdate(supabase: Supabase, applicationId: string) {
  return supabase
    .from('applications')
    .update({
      status: 'closed',
      last_updated_date: new Date().toISOString(),
    })
    .eq('id', applicationId)
}

/** Insert a new application and return the row. */
export async function insertApplication(
  supabase: Supabase,
  data: {
    company_owner_id?: string | null
    agency_id?: string | null
    application_name: string
    state: string
    license_type_id?: string | null
    playbook_id?: string | null
    status: string
    progress_percentage: number
    started_date: string
    last_updated_date: string
    submitted_date?: string | null
  }
) {
  return supabase.from('applications').insert(data as Record<string, unknown>).select().single()
}

/** Insert application row with arbitrary columns (e.g. staff licenses). Returns row so RLS failures are visible. */
export async function insertApplicationRow(supabase: Supabase, data: Record<string, unknown>) {
  return supabase.from('applications').insert(data).select('id').single()
}

/** Delete application by id. */
export async function deleteApplicationById(supabase: Supabase, applicationId: string) {
  return supabase.from('applications').delete().eq('id', applicationId)
}

/** RPC: copy expert steps from license requirement to application. */
export async function rpcCopyExpertStepsToApplication(
  supabase: Supabase,
  p_application_id: string,
  p_state: string,
  p_license_type_name: string
) {
  return supabase.rpc('copy_expert_steps_to_application', {
    p_application_id,
    p_state,
    p_license_type_name,
  })
}

/** Application documents by application_id, ordered by created_at desc. */
export async function getApplicationDocumentsByApplicationId(supabase: Supabase, applicationId: string) {
  return supabase
    .from('application_documents')
    .select(APPLICATION_DOCUMENTS_COLUMNS)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
}

/** Insert application_document and return. */
export async function insertApplicationDocument(
  supabase: Supabase,
  data: Record<string, unknown>
) {
  return supabase.from('application_documents').insert(data).select().single()
}

/** Replace the file of an existing application_document record (url, name, type, description). */
export async function updateApplicationDocumentFile(
  supabase: Supabase,
  documentId: string,
  applicationId: string,
  data: { document_url: string; document_name: string; document_type: string | null; description: string | null }
) {
  return supabase
    .from('application_documents')
    .update(data)
    .eq('id', documentId)
    .eq('application_id', applicationId)
}

/** Application steps by application_id, ordered by step_order. */
export async function getApplicationStepsByApplicationId(supabase: Supabase, applicationId: string) {
  return supabase
    .from('application_steps')
    .select(APPLICATION_STEPS_COLUMNS)
    .eq('application_id', applicationId)
    .order('step_order', { ascending: true })
}

/** Expert application steps (is_expert_step = true) by application_id, ordered by step_order. */
export async function getExpertApplicationStepsByApplicationId(supabase: Supabase, applicationId: string) {
  return supabase
    .from('application_steps')
    .select(APPLICATION_STEPS_COLUMNS)
    .eq('application_id', applicationId)
    .eq('is_expert_step', true)
    .order('step_order', { ascending: true })
}

/** Get max step_order for expert steps in an application (for adding new expert step). */
export async function getMaxExpertStepOrderForApplication(supabase: Supabase, applicationId: string) {
  return supabase
    .from('application_steps')
    .select('step_order')
    .eq('application_id', applicationId)
    .eq('is_expert_step', true)
    .order('step_order', { ascending: false })
    .limit(1)
}

/** Update application_document status (e.g. to 'pending'). */
export async function updateApplicationDocumentStatus(
  supabase: Supabase,
  documentId: string,
  applicationId: string,
  status: string
) {
  return supabase
    .from('application_documents')
    .update({ status })
    .eq('id', documentId)
    .eq('application_id', applicationId)
}

/** Update application_document review (status, expert_review_notes). */
export async function updateApplicationDocumentReview(
  supabase: Supabase,
  documentId: string,
  data: { status: string; expert_review_notes: string | null }
) {
  return supabase.from('application_documents').update(data).eq('id', documentId)
}

/** Get application assigned_expert_id. */
export async function getApplicationAssignedExpertId(supabase: Supabase, applicationId: string) {
  return supabase
    .from('applications')
    .select('assigned_expert_id')
    .eq('id', applicationId)
    .single()
}

/** Update application_steps is_completed and completed_at. */
export async function updateApplicationStepComplete(
  supabase: Supabase,
  stepId: string,
  applicationId: string,
  isCompleted: boolean,
  completedAt: string | null
) {
  return supabase
    .from('application_steps')
    .update({ is_completed: isCompleted, completed_at: completedAt })
    .eq('id', stepId)
    .eq('application_id', applicationId)
}

/** Get application_steps row by application_id and step id. */
export async function getApplicationStepByAppAndId(supabase: Supabase, applicationId: string, stepId: string) {
  return supabase
    .from('application_steps')
    .select('id')
    .eq('application_id', applicationId)
    .eq('id', stepId)
    .maybeSingle()
}

/** Get application_steps row by application_id, step_name, step_order. */
export async function getApplicationStepByAppNameOrder(
  supabase: Supabase,
  applicationId: string,
  stepName: string,
  stepOrder: number
) {
  return supabase
    .from('application_steps')
    .select('id')
    .eq('application_id', applicationId)
    .eq('step_name', stepName)
    .eq('step_order', stepOrder)
    .maybeSingle()
}

/** Insert a single application_steps row. */
export async function insertApplicationStepRow(supabase: Supabase, row: Record<string, unknown>) {
  return supabase.from('application_steps').insert(row)
}

/** Insert multiple application_steps rows. */
export async function insertApplicationStepsRows(supabase: Supabase, rows: Record<string, unknown>[]) {
  return supabase.from('application_steps').insert(rows)
}

/** List applications for dropdown (id, application_name, state), exclude one id, limit 100. */
export async function getApplicationsListForDropdown(supabase: Supabase, excludeApplicationId: string) {
  return supabase
    .from('applications')
    .select('id, application_name, state')
    .neq('id', excludeApplicationId)
    .order('created_at', { ascending: false })
    .limit(100)
}

/** Update application_steps row by id (e.g. step_name, description, phase). */
export async function updateApplicationStepById(
  supabase: Supabase,
  stepId: string,
  data: Record<string, unknown>
) {
  return supabase.from('application_steps').update(data).eq('id', stepId)
}

/** Update application_steps is_completed/completed_at by id and application_id. */
export async function updateApplicationStepCompleteById(
  supabase: Supabase,
  stepId: string,
  applicationId: string,
  data: { is_completed: boolean; completed_at: string | null }
) {
  return supabase
    .from('application_steps')
    .update(data)
    .eq('id', stepId)
    .eq('application_id', applicationId)
}

/** Delete application_steps row (expert step) by id. */
export async function deleteApplicationExpertStepById(supabase: Supabase, stepId: string) {
  return supabase.from('application_steps').delete().eq('id', stepId).eq('is_expert_step', true)
}

/** Update application status (and optional revision_reason). */
export async function updateApplicationStatus(
  supabase: Supabase,
  applicationId: string,
  data: { status: string; revision_reason?: string | null }
) {
  return supabase.from('applications').update(data).eq('id', applicationId)
}

/** Update application by id with arbitrary fields. */
export async function updateApplicationById(
  supabase: Supabase,
  applicationId: string,
  data: Record<string, unknown>
) {
  return supabase.from('applications').update(data).eq('id', applicationId)
}

/** Get latest application_document by application_id (document_url, document_name). */
export async function getLatestApplicationDocumentByApplicationId(
  supabase: Supabase,
  applicationId: string
) {
  return supabase
    .from('application_documents')
    .select('document_url, document_name')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
}

/** Get application by id if user is company_owner or assigned_expert. */
export async function getApplicationByIdForOwnerOrExpert(
  supabase: Supabase,
  applicationId: string,
  userId: string
) {
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .eq('id', applicationId)
    .or(`company_owner_id.eq.${userId},assigned_expert_id.eq.${userId}`)
    .single()
}

/** Get application ids by company_owner_id. */
export async function getApplicationIdsByCompanyOwnerId(supabase: Supabase, companyOwnerId: string) {
  return supabase.from('applications').select('id').eq('company_owner_id', companyOwnerId)
}

/** Get applications by company_owner_id, ordered by last_updated_date desc. */
export async function getApplicationsByCompanyOwnerId(supabase: Supabase, companyOwnerId: string) {
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .eq('company_owner_id', companyOwnerId)
    .order('last_updated_date', { ascending: false })
}

/** Get one application by company_owner_id and assigned_expert_id (for expert send message). */
export async function getApplicationByCompanyOwnerAndExpert(
  supabase: Supabase,
  companyOwnerId: string,
  expertUserId: string
) {
  return supabase
    .from('applications')
    .select('id')
    .eq('company_owner_id', companyOwnerId)
    .eq('assigned_expert_id', expertUserId)
    .order('last_updated_date', { ascending: false })
    .limit(1)
    .maybeSingle()
}

/** Get application_id for each row in application_documents (for counting docs per application). */
export async function getApplicationDocumentsApplicationIds(
  supabase: Supabase,
  applicationIds: string[]
) {
  if (applicationIds.length === 0) return { data: [], error: null }
  return supabase
    .from('application_documents')
    .select('application_id')
    .in('application_id', applicationIds)
}

/** Get applications by caregiver_member_id (e.g. staff licenses, status approved). */
export async function getApplicationsByStaffMemberIds(
  supabase: Supabase,
  staffMemberIds: string[]
) {
  if (staffMemberIds.length === 0) return { data: [], error: null }
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .in('caregiver_member_id', staffMemberIds)
    .not('caregiver_member_id', 'is', null)
    .eq('status', 'approved')
}

/** Get all applications by caregiver_member_ids (any status, for caregiver dashboard). */
export async function getApplicationsByStaffMemberIdsAll(
  supabase: Supabase,
  staffMemberIds: string[]
) {
  if (staffMemberIds.length === 0) return { data: [], error: null }
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .in('caregiver_member_id', staffMemberIds)
    .not('caregiver_member_id', 'is', null)
}

/** Get application ids by assigned_expert_id. */
export async function getApplicationIdsByAssignedExpertId(supabase: Supabase, expertId: string) {
  return supabase.from('applications').select('id').eq('assigned_expert_id', expertId)
}

/** Get applications by assigned_expert_id (user_id), ordered by created_at desc. */
export async function getApplicationsByAssignedExpertId(supabase: Supabase, expertUserId: string) {
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .eq('assigned_expert_id', expertUserId)
    .order('created_at', { ascending: false })
}

/** Get applications by assigned_expert_id with select (e.g. for expert detail). */
export async function getApplicationsByAssignedExpertIdSelect(
  supabase: Supabase,
  expertUserId: string,
  select = 'id, application_name, state, status, progress_percentage, created_at'
) {
  return supabase
    .from('applications')
    .select(select)
    .eq('assigned_expert_id', expertUserId)
    .order('created_at', { ascending: false })
}

/** Get application by id (no owner/expert filter). */
export async function getApplicationById(supabase: Supabase, applicationId: string) {
  return supabase.from('applications').select(APPLICATIONS_COLUMNS).eq('id', applicationId).single()
}

/** Get application by id and caregiver_member_id (for staff dashboard detail). */
export async function getApplicationByIdAndStaffMemberId(
  supabase: Supabase,
  applicationId: string,
  staffMemberId: string
) {
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .eq('id', applicationId)
    .eq('caregiver_member_id', staffMemberId)
    .single()
}

/** Get applications by status, ordered by created_at desc. */
export async function getApplicationsByStatus(supabase: Supabase, status: string) {
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .eq('status', status)
    .order('created_at', { ascending: false })
}

/** Get all applications for an agency (agency-centric view for admin/expert). */
export async function getApplicationsByAgencyId(supabase: Supabase, agencyId: string) {
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
}

/** Get application ids for an agency (for notification scoping). */
export async function getApplicationIdsByAgencyId(supabase: Supabase, agencyId: string) {
  return supabase.from('applications').select('id').eq('agency_id', agencyId)
}

/** Get one application by agency_id and assigned_expert_id (for expert send message). */
export async function getApplicationByAgencyAndExpert(
  supabase: Supabase,
  agencyId: string,
  expertUserId: string
) {
  return supabase
    .from('applications')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('assigned_expert_id', expertUserId)
    .order('last_updated_date', { ascending: false })
    .limit(1)
    .maybeSingle()
}

/** Get applications by statuses, ordered by created_at desc. */
export async function getApplicationsByStatuses(supabase: Supabase, statuses: string[]) {
  if (statuses.length === 0) return { data: [], error: null }
  return supabase
    .from('applications')
    .select(APPLICATIONS_COLUMNS)
    .in('status', statuses)
    .order('created_at', { ascending: false })
}
