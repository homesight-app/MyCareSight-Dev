import sql from '@/db'

const APPLICATIONS_COLUMNS = 'id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id'
const APPLICATION_STEPS_COLUMNS = 'id, application_id, step_name, step_order, is_completed, completed_at, completed_by, notes, created_at, updated_at, is_expert_step, created_by_expert_id, description, phase, instructions'
const APPLICATION_DOCUMENTS_COLUMNS = 'id, application_id, document_name, document_url, document_type, status, created_at, description, expert_review_notes, license_requirement_document_id'

/** Fetch application by id for close check (id, progress_percentage, status). */
export async function getApplicationForClose(applicationId: string) {
  try {
    const rows = await sql`SELECT id, progress_percentage, status FROM applications WHERE id = ${applicationId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application license_type_id, state, status by id. */
export async function getApplicationLicenseTypeState(applicationId: string) {
  try {
    const rows = await sql`SELECT license_type_id, state, status FROM applications WHERE id = ${applicationId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application assigned_expert_id, application_name, company_owner_id by id. */
export async function getApplicationExpertAndOwner(applicationId: string) {
  try {
    const rows = await sql`SELECT assigned_expert_id, application_name, company_owner_id FROM applications WHERE id = ${applicationId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Set application status to closed and last_updated_date. */
export async function closeApplicationUpdate(applicationId: string) {
  try {
    await sql`UPDATE applications SET status = 'closed', last_updated_date = ${new Date().toISOString()} WHERE id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Insert a new application and return the row. */
export async function insertApplication(
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
  try {
    const rows = await sql`INSERT INTO applications ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Insert application row with arbitrary columns (e.g. staff licenses). Returns row so RLS failures are visible. */
export async function insertApplicationRow(data: Record<string, unknown>) {
  try {
    const rows = await sql`INSERT INTO applications ${sql(data, ...Object.keys(data) as any)} RETURNING id`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Delete application by id. */
export async function deleteApplicationById(applicationId: string) {
  try {
    await sql`DELETE FROM applications WHERE id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** RPC: copy expert steps from license requirement to application. */
export async function rpcCopyExpertStepsToApplication(
  p_application_id: string,
  p_state: string,
  p_license_type_name: string
) {
  try {
    const rows = await sql`SELECT copy_expert_steps_to_application(${p_application_id}, ${p_state}, ${p_license_type_name}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Application documents by application_id, ordered by created_at desc. */
export async function getApplicationDocumentsByApplicationId(applicationId: string) {
  try {
    const rows = await sql`SELECT id, application_id, document_name, document_url, document_type, status, created_at, description, expert_review_notes, license_requirement_document_id FROM application_documents WHERE application_id = ${applicationId} ORDER BY created_at DESC LIMIT 100`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Insert application_document and return. */
export async function insertApplicationDocument(data: Record<string, unknown>) {
  try {
    const rows = await sql`INSERT INTO application_documents ${sql(data, ...Object.keys(data) as any)} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Replace the file of an existing application_document record (url, name, type, description). */
export async function updateApplicationDocumentFile(
  documentId: string,
  applicationId: string,
  data: { document_url: string; document_name: string; document_type: string | null; description: string | null }
) {
  try {
    await sql`UPDATE application_documents SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${documentId} AND application_id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Application steps by application_id, ordered by step_order. */
export async function getApplicationStepsByApplicationId(applicationId: string) {
  try {
    const rows = await sql`SELECT id, application_id, step_name, step_order, is_completed, completed_at, completed_by, notes, created_at, updated_at, is_expert_step, created_by_expert_id, description, phase, instructions FROM application_steps WHERE application_id = ${applicationId} ORDER BY step_order ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Expert application steps (is_expert_step = true) by application_id, ordered by step_order. */
export async function getExpertApplicationStepsByApplicationId(applicationId: string) {
  try {
    const rows = await sql`SELECT id, application_id, step_name, step_order, is_completed, completed_at, completed_by, notes, created_at, updated_at, is_expert_step, created_by_expert_id, description, phase, instructions FROM application_steps WHERE application_id = ${applicationId} AND is_expert_step = true ORDER BY step_order ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get max step_order for expert steps in an application (for adding new expert step). */
export async function getMaxExpertStepOrderForApplication(applicationId: string) {
  try {
    const rows = await sql`SELECT step_order FROM application_steps WHERE application_id = ${applicationId} AND is_expert_step = true ORDER BY step_order DESC LIMIT 1`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update application_document status (e.g. to 'pending'). */
export async function updateApplicationDocumentStatus(
  documentId: string,
  applicationId: string,
  status: string
) {
  try {
    await sql`UPDATE application_documents SET status = ${status} WHERE id = ${documentId} AND application_id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update application_document review (status, expert_review_notes). */
export async function updateApplicationDocumentReview(
  documentId: string,
  data: { status: string; expert_review_notes: string | null }
) {
  try {
    await sql`UPDATE application_documents SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${documentId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application assigned_expert_id. */
export async function getApplicationAssignedExpertId(applicationId: string) {
  try {
    const rows = await sql`SELECT assigned_expert_id FROM applications WHERE id = ${applicationId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update application_steps is_completed and completed_at. */
export async function updateApplicationStepComplete(
  stepId: string,
  applicationId: string,
  isCompleted: boolean,
  completedAt: string | null
) {
  try {
    await sql`UPDATE application_steps SET is_completed = ${isCompleted}, completed_at = ${completedAt} WHERE id = ${stepId} AND application_id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application_steps row by application_id and step id. */
export async function getApplicationStepByAppAndId(applicationId: string, stepId: string) {
  try {
    const rows = await sql`SELECT id FROM application_steps WHERE application_id = ${applicationId} AND id = ${stepId} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application_steps row by application_id, step_name, step_order. */
export async function getApplicationStepByAppNameOrder(
  applicationId: string,
  stepName: string,
  stepOrder: number
) {
  try {
    const rows = await sql`SELECT id FROM application_steps WHERE application_id = ${applicationId} AND step_name = ${stepName} AND step_order = ${stepOrder} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Insert a single application_steps row. */
export async function insertApplicationStepRow(row: Record<string, unknown>) {
  try {
    await sql`INSERT INTO application_steps ${sql(row, ...Object.keys(row) as any)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Insert multiple application_steps rows. */
export async function insertApplicationStepsRows(rows: Record<string, unknown>[]) {
  try {
    if (rows.length === 0) return { data: null, error: null }
    await sql`INSERT INTO application_steps ${sql(rows)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** List applications for dropdown (id, application_name, state), exclude one id, limit 100. */
export async function getApplicationsListForDropdown(excludeApplicationId: string) {
  try {
    const rows = await sql`SELECT id, application_name, state FROM applications WHERE id != ${excludeApplicationId} ORDER BY created_at DESC LIMIT 100`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update application_steps row by id (e.g. step_name, description, phase). */
export async function updateApplicationStepById(
  stepId: string,
  data: Record<string, unknown>
) {
  try {
    await sql`UPDATE application_steps SET ${sql(data, ...Object.keys(data) as any)} WHERE id = ${stepId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update application_steps is_completed/completed_at by id and application_id. */
export async function updateApplicationStepCompleteById(
  stepId: string,
  applicationId: string,
  data: { is_completed: boolean; completed_at: string | null }
) {
  try {
    await sql`UPDATE application_steps SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${stepId} AND application_id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Delete application_steps row (expert step) by id. */
export async function deleteApplicationExpertStepById(stepId: string) {
  try {
    await sql`DELETE FROM application_steps WHERE id = ${stepId} AND is_expert_step = true`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update application status (and optional revision_reason). */
export async function updateApplicationStatus(
  applicationId: string,
  data: { status: string; revision_reason?: string | null }
) {
  try {
    await sql`UPDATE applications SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update application by id with arbitrary fields. */
export async function updateApplicationById(
  applicationId: string,
  data: Record<string, unknown>
) {
  try {
    await sql`UPDATE applications SET ${sql(data, ...Object.keys(data) as any)} WHERE id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get latest application_document by application_id (document_url, document_name). */
export async function getLatestApplicationDocumentByApplicationId(
  applicationId: string
) {
  try {
    const rows = await sql`SELECT document_url, document_name FROM application_documents WHERE application_id = ${applicationId} ORDER BY created_at DESC LIMIT 1`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application by id if user is company_owner or assigned_expert. */
export async function getApplicationByIdForOwnerOrExpert(
  applicationId: string,
  userId: string
) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE id = ${applicationId} AND (company_owner_id = ${userId} OR assigned_expert_id = ${userId})`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application ids by company_owner_id. */
export async function getApplicationIdsByCompanyOwnerId(companyOwnerId: string) {
  try {
    const rows = await sql`SELECT id FROM applications WHERE company_owner_id = ${companyOwnerId}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get applications by company_owner_id, ordered by last_updated_date desc. */
export async function getApplicationsByCompanyOwnerId(companyOwnerId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE company_owner_id = ${companyOwnerId} ORDER BY last_updated_date DESC LIMIT 500`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get one application by company_owner_id and assigned_expert_id (for expert send message). */
export async function getApplicationByCompanyOwnerAndExpert(
  companyOwnerId: string,
  expertUserId: string
) {
  try {
    const rows = await sql`SELECT id FROM applications WHERE company_owner_id = ${companyOwnerId} AND assigned_expert_id = ${expertUserId} ORDER BY last_updated_date DESC LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application_id for each row in application_documents (for counting docs per application). */
export async function getApplicationDocumentsApplicationIds(
  applicationIds: string[]
) {
  if (applicationIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT application_id FROM application_documents WHERE application_id = ANY(${applicationIds as any})`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get applications by caregiver_member_id (e.g. staff licenses, status approved). */
export async function getApplicationsByStaffMemberIds(
  staffMemberIds: string[]
) {
  if (staffMemberIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE caregiver_member_id = ANY(${staffMemberIds as any}) AND caregiver_member_id IS NOT NULL AND status = 'approved'`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get all applications by caregiver_member_ids (any status, for caregiver dashboard). */
export async function getApplicationsByStaffMemberIdsAll(
  staffMemberIds: string[]
) {
  if (staffMemberIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE caregiver_member_id = ANY(${staffMemberIds as any}) AND caregiver_member_id IS NOT NULL`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application ids by assigned_expert_id. */
export async function getApplicationIdsByAssignedExpertId(expertId: string) {
  try {
    const rows = await sql`SELECT id FROM applications WHERE assigned_expert_id = ${expertId}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get applications by assigned_expert_id (user_id), ordered by created_at desc. */
export async function getApplicationsByAssignedExpertId(expertUserId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE assigned_expert_id = ${expertUserId} ORDER BY created_at DESC LIMIT 500`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export interface GetApplicationsByExpertPaginatedOpts {
  page?: number
  pageSize?: number
  search?: string
}

/** Paginated applications for an expert. Searches application_name and state. */
export async function getApplicationsByAssignedExpertIdPaginated(
  expertUserId: string,
  opts?: GetApplicationsByExpertPaginatedOpts
) {
  const page     = opts?.page     ?? 0
  const pageSize = opts?.pageSize ?? 50
  const from     = page * pageSize

  try {
    const searchTerm = opts?.search?.trim()

    let dataRows: any[]
    let countRows: any[]

    if (searchTerm) {
      const term = `%${searchTerm}%`
      ;[dataRows, countRows] = await Promise.all([
        sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE assigned_expert_id = ${expertUserId} AND (application_name ILIKE ${term} OR state ILIKE ${term}) ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${from}`,
        sql`SELECT COUNT(*) AS count FROM applications WHERE assigned_expert_id = ${expertUserId} AND (application_name ILIKE ${term} OR state ILIKE ${term})`,
      ])
    } else {
      ;[dataRows, countRows] = await Promise.all([
        sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE assigned_expert_id = ${expertUserId} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${from}`,
        sql`SELECT COUNT(*) AS count FROM applications WHERE assigned_expert_id = ${expertUserId}`,
      ])
    }

    return {
      data: dataRows as unknown as any[],
      count: Number(countRows[0]?.count ?? 0),
      error: null,
    }
  } catch (err) {
    return { data: [], count: 0, error: err as Error }
  }
}

/** Get applications by assigned_expert_id with select (e.g. for expert detail). */
export async function getApplicationsByAssignedExpertIdSelect(
  expertUserId: string,
  select = 'id, application_name, state, status, progress_percentage, created_at'
) {
  try {
    const rows = await sql.unsafe(`SELECT ${select} FROM applications WHERE assigned_expert_id = $1 ORDER BY created_at DESC`, [expertUserId])
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application by id (no owner/expert filter). */
export async function getApplicationById(applicationId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE id = ${applicationId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application by id and caregiver_member_id (for staff dashboard detail). */
export async function getApplicationByIdAndStaffMemberId(
  applicationId: string,
  staffMemberId: string
) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE id = ${applicationId} AND caregiver_member_id = ${staffMemberId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get applications by status, ordered by created_at desc. */
export async function getApplicationsByStatus(status: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE status = ${status} ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get all applications for an agency (agency-centric view for admin/expert). */
export async function getApplicationsByAgencyId(agencyId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE agency_id = ${agencyId} ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application ids for an agency (for notification scoping). */
export async function getApplicationIdsByAgencyId(agencyId: string) {
  try {
    const rows = await sql`SELECT id FROM applications WHERE agency_id = ${agencyId}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get one application by agency_id and assigned_expert_id (for expert send message). */
export async function getApplicationByAgencyAndExpert(
  agencyId: string,
  expertUserId: string
) {
  try {
    const rows = await sql`SELECT id FROM applications WHERE agency_id = ${agencyId} AND assigned_expert_id = ${expertUserId} ORDER BY last_updated_date DESC LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get applications by statuses, ordered by created_at desc. */
export async function getApplicationsByStatuses(statuses: string[]) {
  if (statuses.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT id, company_owner_id, state, application_name, status, progress_percentage, started_date, last_updated_date, submitted_date, created_at, updated_at, license_type_id, assigned_expert_id, revision_reason, caregiver_member_id, license_number, issue_date, expiry_date, days_until_expiry, issuing_authority, agency_id, playbook_id, closed_by, closed_at, close_reason, completed_by, completed_at, complete_reason, category_id, subcategory_id FROM applications WHERE status = ANY(${statuses as any}) ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Set application status to 'closed' with audit columns. */
export async function closeApplicationManualUpdate(
  applicationId: string,
  agencyId: string,
  closedBy: string,
  closeReason: string
) {
  try {
    await sql`UPDATE applications SET status = 'closed', closed_by = ${closedBy}, closed_at = ${new Date().toISOString()}, close_reason = ${closeReason}, last_updated_date = ${new Date().toISOString().split('T')[0]} WHERE id = ${applicationId} AND agency_id = ${agencyId} AND status NOT IN ('approved', 'rejected')`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Move application to 'under_review' (same as finishing all steps), with audit columns. */
export async function completeApplicationManualUpdate(
  applicationId: string,
  agencyId: string,
  completedBy: string,
  completeReason: string
) {
  try {
    await sql`UPDATE applications SET status = 'under_review', completed_by = ${completedBy}, completed_at = ${new Date().toISOString()}, complete_reason = ${completeReason}, last_updated_date = ${new Date().toISOString().split('T')[0]} WHERE id = ${applicationId} AND agency_id = ${agencyId} AND status NOT IN ('approved', 'rejected')`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Re-open a closed or complete application back to in_progress, clearing audit columns. */
export async function reopenApplicationUpdate(
  applicationId: string,
  agencyId: string
) {
  try {
    await sql`UPDATE applications SET status = 'in_progress', closed_by = NULL, closed_at = NULL, close_reason = NULL, completed_by = NULL, completed_at = NULL, complete_reason = NULL, last_updated_date = ${new Date().toISOString().split('T')[0]} WHERE id = ${applicationId} AND agency_id = ${agencyId} AND status = ANY(${['closed', 'complete'] as any})`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get application agency_id and status by id (for close/complete/reopen auth checks). */
export async function getApplicationAgencyAndStatus(applicationId: string) {
  try {
    const rows = await sql`SELECT id, agency_id, status, application_name FROM applications WHERE id = ${applicationId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
