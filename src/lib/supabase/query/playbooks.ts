import sql from '@/db'

export interface PlaybookItem {
  id: string
  playbook_id: string
  item_order: number
  item_type: 'step' | 'document'
  name: string
  description: string | null
  instructions: string | null
  estimated_days: number | null
  document_type: string | null
  phase: string | null
  assignment: 'client' | 'expert' | 'both'
  requirement_type: 'required' | 'optional'
  source_step_id: string | null
  source_document_id: string | null
  created_at: string
  updated_at: string
}

export interface ValidationRule {
  id: string
  name: string
  description: string | null
  field_key: string
  is_active: boolean
  sort_order: number
}

export interface PlaybookItemValidationRule {
  id: string
  playbook_item_id: string
  validation_rule_id: string
  rule_order: number
  is_required: boolean
}

export interface Playbook {
  id: string
  name: string
  playbook_type: string
  description: string | null
  license_requirement_id: string | null
  is_active: boolean
  created_at: string
}

export async function getPlaybookByRequirementId(licenseRequirementId: string) {
  try {
    const rows = await sql`SELECT id, name, playbook_type, description, license_requirement_id, is_active, created_at FROM playbooks WHERE license_requirement_id = ${licenseRequirementId} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertPlaybook(
  payload: {
    name: string
    license_requirement_id: string
    created_by: string
    state?: string | null
    description?: string | null
    cost_min?: number | null
    cost_max?: number | null
    cost_display?: string | null
    service_fee?: number | null
    service_fee_display?: string | null
    processing_time_min?: number | null
    processing_time_max?: number | null
    processing_time_display?: string | null
    renewal_period_years?: number | null
    renewal_period_display?: string | null
    icon_type?: string | null
    requirements?: string[] | null
  }
) {
  try {
    const { name, license_requirement_id, created_by, ...rest } = payload
    const data = {
      name,
      playbook_type: 'license_requirement',
      license_requirement_id,
      created_by,
      updated_at: new Date().toISOString(),
      ...rest,
    }
    const rows = await sql`INSERT INTO playbooks ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} RETURNING id, name, playbook_type, description, license_requirement_id, is_active, created_at`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getPlaybookItems(playbookId: string) {
  try {
    const rows = await sql`SELECT id, playbook_id, item_order, item_type, name, description, instructions, estimated_days, document_type, phase, assignment, requirement_type, source_step_id, source_document_id, created_at, updated_at FROM playbook_items WHERE playbook_id = ${playbookId} ORDER BY item_order ASC`
    return { data: rows as unknown as PlaybookItem[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertPlaybookItem(
  payload: {
    playbook_id: string
    item_order: number
    item_type: 'step' | 'document'
    name: string
    description?: string | null
    instructions?: string | null
    estimated_days?: number | null
    document_type?: string | null
    phase?: string | null
    assignment: 'client' | 'expert' | 'both'
    requirement_type: 'required' | 'optional'
    source_step_id?: string | null
    source_document_id?: string | null
  }
) {
  try {
    const data = { ...payload, updated_at: new Date().toISOString() }
    const rows = await sql`INSERT INTO playbook_items ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} RETURNING id, playbook_id, item_order, item_type, name, description, instructions, estimated_days, document_type, phase, assignment, requirement_type, source_step_id, source_document_id, created_at, updated_at`
    return { data: rows[0] as PlaybookItem, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function bulkInsertPlaybookItems(
  items: Array<{
    playbook_id: string
    item_order: number
    item_type: 'step' | 'document'
    name: string
    description?: string | null
    instructions?: string | null
    estimated_days?: number | null
    document_type?: string | null
    phase?: string | null
    assignment: 'client' | 'expert' | 'both'
    requirement_type: 'required' | 'optional'
    source_step_id?: string | null
    source_document_id?: string | null
  }>
) {
  try {
    const now = new Date().toISOString()
    const rows = items.map(item => ({ ...item, updated_at: now }))
    if (rows.length === 0) return { data: null, error: null }
    await sql`INSERT INTO playbook_items ${sql(rows)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updatePlaybookItem(
  itemId: string,
  payload: Partial<{
    name: string
    description: string | null
    instructions: string | null
    estimated_days: number | null
    document_type: string | null
    phase: string | null
    assignment: 'client' | 'expert' | 'both'
    requirement_type: 'required' | 'optional'
  }>
) {
  try {
    const data = { ...payload, updated_at: new Date().toISOString() }
    await sql`UPDATE playbook_items SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${itemId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deletePlaybookItem(itemId: string) {
  try {
    await sql`DELETE FROM playbook_items WHERE id = ${itemId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function reorderPlaybookItems(orderedIds: string[]) {
  try {
    const now = new Date().toISOString()
    await Promise.all(
      orderedIds.map((id, index) =>
        sql`UPDATE playbook_items SET item_order = ${index + 1}, updated_at = ${now} WHERE id = ${id}`
      )
    )
    return { error: null }
  } catch (err) {
    return { error: err as Error }
  }
}

// ─── Validation rules ────────────────────────────────────────────────────────

export async function getValidationRuleLibrary() {
  try {
    const rows = await sql`SELECT id, name, description, field_key, is_active, sort_order FROM validation_rules WHERE is_active = true ORDER BY sort_order ASC`
    return { data: rows as unknown as ValidationRule[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getPlaybookItemValidationRules(playbookItemId: string) {
  try {
    const rows = await sql`SELECT id, playbook_item_id, validation_rule_id, rule_order, is_required FROM playbook_item_validation_rules WHERE playbook_item_id = ${playbookItemId} ORDER BY rule_order ASC`
    return { data: rows as unknown as PlaybookItemValidationRule[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function setPlaybookItemValidationRules(
  playbookItemId: string,
  rules: Array<{ validation_rule_id: string; rule_order: number; is_required: boolean }>
) {
  try {
    await sql`DELETE FROM playbook_item_validation_rules WHERE playbook_item_id = ${playbookItemId}`
    if (rules.length === 0) return { error: null }
    const rows = rules.map(r => ({ ...r, playbook_item_id: playbookItemId }))
    await sql`INSERT INTO playbook_item_validation_rules ${sql(rows)}`
    return { error: null }
  } catch (err) {
    return { error: err as Error }
  }
}

// ─── Application playbook items ───────────────────────────────────────────────

export interface ApplicationPlaybookItem {
  id: string
  application_id: string
  playbook_item_id: string | null
  item_order: number
  item_type: 'step' | 'document'
  name: string
  description: string | null
  instructions: string | null
  document_type: string | null
  phase: string | null
  assignment: 'client' | 'expert' | 'both'
  requirement_type: 'required' | 'optional'
  status: 'not_started' | 'in_progress' | 'review_needed' | 'approved'
  due_date: string | null
  notes: string | null
  updated_by: string | null
  approved_at: string | null
  approved_by: string | null
  source_application_step_id: string | null
  source_application_document_id: string | null
  source_license_requirement_document_id: string | null
  created_at: string
  updated_at: string
}

export interface ApplicationRuleCheck {
  id: string
  application_playbook_item_id: string
  validation_rule_id: string | null
  rule_name: string
  field_key: string
  description: string | null
  rule_order: number
  is_required: boolean
  is_checked: boolean
  checked_by: string | null
  checked_at: string | null
  notes: string | null
}

const APP_PLAYBOOK_ITEM_SELECT = 'id, application_id, playbook_item_id, item_order, item_type, name, description, instructions, document_type, phase, assignment, requirement_type, status, due_date, notes, updated_by, approved_at, approved_by, source_application_step_id, source_application_document_id, source_license_requirement_document_id, created_at, updated_at'

export async function getApplicationPlaybookItems(applicationId: string) {
  try {
    const rows = await sql`SELECT id, application_id, playbook_item_id, item_order, item_type, name, description, instructions, document_type, phase, assignment, requirement_type, status, due_date, notes, updated_by, approved_at, approved_by, source_application_step_id, source_application_document_id, source_license_requirement_document_id, created_at, updated_at FROM application_playbook_items WHERE application_id = ${applicationId} ORDER BY item_order ASC`
    return { data: rows as unknown as ApplicationPlaybookItem[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateApplicationPlaybookItemRow(
  itemId: string,
  payload: Partial<{
    status: string
    due_date: string | null
    notes: string | null
    updated_by: string
    approved_at: string | null
    approved_by: string | null
  }>
) {
  try {
    const data = { ...payload, updated_at: new Date().toISOString() }
    await sql`UPDATE application_playbook_items SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${itemId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function bulkInsertApplicationPlaybookItems(
  items: Omit<ApplicationPlaybookItem, 'id' | 'created_at' | 'updated_at'>[]
) {
  try {
    const now = new Date().toISOString()
    const rows = items.map(item => ({ ...item, updated_at: now }))
    if (rows.length === 0) return { data: null, error: null }
    await sql`INSERT INTO application_playbook_items ${sql(rows)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getApplicationPlaybookItemCount(applicationId: string) {
  try {
    const rows = await sql`SELECT COUNT(*) AS count FROM application_playbook_items WHERE application_id = ${applicationId}`
    return { count: Number(rows[0]?.count ?? 0), data: null, error: null }
  } catch (err) {
    return { count: 0, data: null, error: err as Error }
  }
}

export async function getRuleChecksForApplicationItem(applicationPlaybookItemId: string) {
  try {
    const rows = await sql`SELECT id, application_playbook_item_id, validation_rule_id, rule_name, field_key, description, rule_order, is_required, is_checked, checked_by, checked_at, notes FROM application_playbook_item_rule_checks WHERE application_playbook_item_id = ${applicationPlaybookItemId} ORDER BY rule_order ASC`
    return { data: rows as unknown as ApplicationRuleCheck[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateApplicationRuleCheck(
  ruleCheckId: string,
  payload: {
    is_checked: boolean
    checked_by: string | null
    checked_at: string | null
    notes?: string | null
  }
) {
  try {
    const data = { ...payload, updated_at: new Date().toISOString() }
    await sql`UPDATE application_playbook_item_rule_checks SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${ruleCheckId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getDocumentsByPlaybookItem(applicationPlaybookItemId: string) {
  try {
    const rows = await sql`SELECT id, document_name, document_url, document_type, status, description, expert_review_notes, created_at FROM application_documents WHERE application_playbook_item_id = ${applicationPlaybookItemId} ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getRequestedProgramApplications() {
  try {
    const rows = await sql`
      SELECT a.id, a.application_name, a.state, a.status, a.agency_id, a.playbook_id, a.created_at,
        json_build_object('id', ag.id, 'name', ag.name) AS agencies
      FROM applications a
      LEFT JOIN agencies ag ON ag.id = a.agency_id
      WHERE a.status = 'requested' AND a.playbook_id IS NOT NULL
      ORDER BY a.created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getApplicationsWithPrograms(expertId?: string) {
  try {
    let rows: Record<string, unknown>[]
    if (expertId) {
      rows = await sql`
        SELECT a.id, a.application_name, a.state, a.status, a.agency_id, a.assigned_expert_id,
          json_build_object('id', ag.id, 'name', ag.name) AS agencies,
          COALESCE(json_agg(json_build_object('status', api.status, 'requirement_type', api.requirement_type)) FILTER (WHERE api.id IS NOT NULL), '[]') AS application_playbook_items
        FROM applications a
        LEFT JOIN agencies ag ON ag.id = a.agency_id
        LEFT JOIN application_playbook_items api ON api.application_id = a.id
        WHERE a.assigned_expert_id = ${expertId}
        GROUP BY a.id, ag.id
        ORDER BY a.created_at DESC
      `
    } else {
      rows = await sql`
        SELECT a.id, a.application_name, a.state, a.status, a.agency_id, a.assigned_expert_id,
          json_build_object('id', ag.id, 'name', ag.name) AS agencies,
          COALESCE(json_agg(json_build_object('status', api.status, 'requirement_type', api.requirement_type)) FILTER (WHERE api.id IS NOT NULL), '[]') AS application_playbook_items
        FROM applications a
        LEFT JOIN agencies ag ON ag.id = a.agency_id
        LEFT JOIN application_playbook_items api ON api.application_id = a.id
        GROUP BY a.id, ag.id
        ORDER BY a.created_at DESC
      `
    }
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getApplicationsWithProgramsByAgencyId(agencyId: string) {
  try {
    const rows = await sql`
      SELECT a.id, a.application_name, a.state, a.status, a.agency_id, a.assigned_expert_id, a.created_at,
        COALESCE(json_agg(json_build_object('status', api.status, 'requirement_type', api.requirement_type)) FILTER (WHERE api.id IS NOT NULL), '[]') AS application_playbook_items
      FROM applications a
      INNER JOIN application_playbook_items api ON api.application_id = a.id
      WHERE a.agency_id = ${agencyId}
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export interface GetApplicationsWithProgramsPaginatedOpts {
  page?: number
  pageSize?: number
  search?: string
}

/** Paginated list of applications that have at least one playbook item (RLS-filtered). */
export async function getApplicationsWithProgramsPaginated(
  opts?: GetApplicationsWithProgramsPaginatedOpts
) {
  const page     = opts?.page     ?? 0
  const pageSize = opts?.pageSize ?? 50
  const from     = page * pageSize

  try {
    const searchTerm = opts?.search?.trim()

    let dataRows: Record<string, unknown>[]
    let countRows: Record<string, unknown>[]

    if (searchTerm) {
      const term = `%${searchTerm}%`
      ;[dataRows, countRows] = await Promise.all([
        sql`
          SELECT a.id, a.application_name, a.state, a.status, a.agency_id, a.assigned_expert_id,
            json_build_object('id', ag.id, 'name', ag.name) AS agencies,
            COALESCE(json_agg(json_build_object('status', api.status, 'requirement_type', api.requirement_type)) FILTER (WHERE api.id IS NOT NULL), '[]') AS application_playbook_items
          FROM applications a
          LEFT JOIN agencies ag ON ag.id = a.agency_id
          LEFT JOIN application_playbook_items api ON api.application_id = a.id
          WHERE a.application_name ILIKE ${term}
          GROUP BY a.id, ag.id
          ORDER BY a.created_at DESC
          LIMIT ${pageSize} OFFSET ${from}
        `,
        sql`SELECT COUNT(*) AS count FROM applications WHERE playbook_id IS NOT NULL AND application_name ILIKE ${term}`,
      ])
    } else {
      ;[dataRows, countRows] = await Promise.all([
        sql`
          SELECT a.id, a.application_name, a.state, a.status, a.agency_id, a.assigned_expert_id,
            json_build_object('id', ag.id, 'name', ag.name) AS agencies,
            COALESCE(json_agg(json_build_object('status', api.status, 'requirement_type', api.requirement_type)) FILTER (WHERE api.id IS NOT NULL), '[]') AS application_playbook_items
          FROM applications a
          LEFT JOIN agencies ag ON ag.id = a.agency_id
          LEFT JOIN application_playbook_items api ON api.application_id = a.id
          GROUP BY a.id, ag.id
          ORDER BY a.created_at DESC
          LIMIT ${pageSize} OFFSET ${from}
        `,
        sql`SELECT COUNT(*) AS count FROM applications WHERE playbook_id IS NOT NULL`,
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

/** Pending (status='requested') program requests for the current agency user (RLS-filtered). */
export async function getRequestedProgramsForAgency() {
  try {
    const rows = await sql`
      SELECT a.id, a.application_name, a.state, a.status, a.created_at, a.playbook_id,
        json_build_object('name', p.name) AS playbooks
      FROM applications a
      LEFT JOIN playbooks p ON p.id = a.playbook_id
      WHERE a.status = 'requested' AND a.playbook_id IS NOT NULL
      ORDER BY a.created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// ─── Rule check management ────────────────────────────────────────────────────

export async function insertApplicationRuleCheck(
  payload: {
    application_playbook_item_id: string
    validation_rule_id: string
    rule_name: string
    field_key: string
    description: string | null
    rule_order: number
    is_required: boolean
  }
) {
  try {
    const data = { ...payload, is_checked: true }
    const rows = await sql`INSERT INTO application_playbook_item_rule_checks ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} RETURNING id, application_playbook_item_id, validation_rule_id, rule_name, field_key, description, rule_order, is_required, is_checked, checked_by, checked_at, notes`
    return { data: rows[0] as ApplicationRuleCheck, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deleteApplicationRuleCheck(ruleCheckId: string) {
  try {
    await sql`DELETE FROM application_playbook_item_rule_checks WHERE id = ${ruleCheckId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function resetApplicationRuleChecks(applicationPlaybookItemId: string) {
  try {
    await sql`UPDATE application_playbook_item_rule_checks SET is_checked = false, checked_by = NULL, checked_at = NULL, notes = NULL, updated_at = ${new Date().toISOString()} WHERE application_playbook_item_id = ${applicationPlaybookItemId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function bulkUpdateApplicationRuleChecks(
  updates: Array<{ id: string; is_checked: boolean; checked_by: string; checked_at: string; notes: string | null }>
) {
  try {
    const now = new Date().toISOString()
    await Promise.all(
      updates.map(u =>
        sql`UPDATE application_playbook_item_rule_checks SET is_checked = ${u.is_checked}, checked_by = ${u.checked_by}, checked_at = ${u.checked_at}, notes = ${u.notes}, updated_at = ${now} WHERE id = ${u.id}`
      )
    )
    return { error: null }
  } catch (err) {
    return { error: err as Error }
  }
}

// ─── Validation runs ──────────────────────────────────────────────────────────

export interface ValidationRunResult {
  rule_name: string
  field_key: string
  expected_value: string
  auto_result: 'found' | 'not_found' | 'extraction_failed'
  match_snippet: string | null
  found_text: string | null
  is_checked: boolean
  notes: string | null
}

export interface ValidationRun {
  id: string
  application_playbook_item_id: string
  run_number: number
  extraction_status: 'success' | 'partial' | 'failed' | 'no_document'
  completed_at: string
  completed_by: string | null
  passed_count: number
  failed_count: number
  needs_review_count: number
  results: ValidationRunResult[]
  created_at: string
}

export async function insertValidationRun(
  payload: {
    application_playbook_item_id: string
    run_number: number
    extraction_status: string
    completed_by: string
    passed_count: number
    failed_count: number
    needs_review_count: number
    results: object[]
  }
) {
  try {
    const rows = await sql`INSERT INTO validation_runs ${sql(payload as Record<string, unknown>, ...Object.keys(payload) as any)} RETURNING id, application_playbook_item_id, run_number, extraction_status, completed_at, completed_by, passed_count, failed_count, needs_review_count, results, created_at`
    return { data: rows[0] as ValidationRun, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getValidationRunsForItem(applicationPlaybookItemId: string) {
  try {
    const rows = await sql`SELECT id, application_playbook_item_id, run_number, extraction_status, completed_at, completed_by, passed_count, failed_count, needs_review_count, results, created_at FROM validation_runs WHERE application_playbook_item_id = ${applicationPlaybookItemId} ORDER BY run_number DESC`
    return { data: rows as unknown as ValidationRun[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// ── Playbook Library ──────────────────────────────────────────────────────────

export async function getAllPlaybooks() {
  try {
    const rows = await sql`
      SELECT p.id, p.name, p.playbook_type, p.description, p.is_active,
        p.state, p.cost_display, p.processing_time_display, p.renewal_period_display, p.icon_type,
        p.category_id, p.subcategory_id, p.created_at,
        json_build_object('id', lr.id, 'state', lr.state, 'license_type', lr.license_type) AS license_requirement,
        json_build_object('id', cat.id, 'name', cat.name) AS category,
        json_build_object('id', sub.id, 'name', sub.name) AS subcategory,
        (SELECT COUNT(*) FROM playbook_items pi WHERE pi.playbook_id = p.id) AS playbook_items_count
      FROM playbooks p
      LEFT JOIN license_requirements lr ON lr.id = p.license_requirement_id
      LEFT JOIN configuration_values cat ON cat.id = p.category_id
      LEFT JOIN configuration_values sub ON sub.id = p.subcategory_id
      ORDER BY p.created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getPlaybookById(playbookId: string) {
  try {
    const rows = await sql`
      SELECT p.id, p.name, p.playbook_type, p.description, p.is_active,
        p.state, p.cost_min, p.cost_max, p.cost_display,
        p.service_fee, p.service_fee_display,
        p.processing_time_min, p.processing_time_max, p.processing_time_display,
        p.renewal_period_years, p.renewal_period_display,
        p.icon_type, p.requirements, p.created_by, p.created_at, p.updated_at,
        p.category_id, p.subcategory_id,
        json_build_object('id', lr.id, 'state', lr.state, 'license_type', lr.license_type) AS license_requirement,
        json_build_object('id', cat.id, 'name', cat.name) AS category,
        json_build_object('id', sub.id, 'name', sub.name) AS subcategory
      FROM playbooks p
      LEFT JOIN license_requirements lr ON lr.id = p.license_requirement_id
      LEFT JOIN configuration_values cat ON cat.id = p.category_id
      LEFT JOIN configuration_values sub ON sub.id = p.subcategory_id
      WHERE p.id = ${playbookId}
    `
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getPlaybooksWithRequirements() {
  try {
    const rows = await sql`
      SELECT p.id,
        json_build_object('state', lr.state, 'license_type', lr.license_type) AS license_requirement
      FROM playbooks p
      LEFT JOIN license_requirements lr ON lr.id = p.license_requirement_id
      WHERE p.is_active = true
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertPlaybookRecord(
  payload: {
    name: string
    playbook_type: string
    description?: string | null
    license_requirement_id?: string | null
    state?: string | null
    cost_min?: number | null
    cost_max?: number | null
    cost_display?: string | null
    service_fee?: number | null
    service_fee_display?: string | null
    processing_time_min?: number | null
    processing_time_max?: number | null
    processing_time_display?: string | null
    renewal_period_years?: number | null
    renewal_period_display?: string | null
    icon_type?: string | null
    requirements?: string[] | null
    is_active?: boolean
    created_by?: string | null
    category_id?: string | null
    subcategory_id?: string | null
  }
) {
  try {
    const rows = await sql`INSERT INTO playbooks ${sql(payload as Record<string, unknown>, ...Object.keys(payload) as any)} RETURNING id`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updatePlaybookRecord(
  playbookId: string,
  payload: {
    name?: string
    playbook_type?: string
    description?: string | null
    license_requirement_id?: string | null
    state?: string | null
    cost_min?: number | null
    cost_max?: number | null
    cost_display?: string | null
    service_fee?: number | null
    service_fee_display?: string | null
    processing_time_min?: number | null
    processing_time_max?: number | null
    processing_time_display?: string | null
    renewal_period_years?: number | null
    renewal_period_display?: string | null
    icon_type?: string | null
    requirements?: string[] | null
    is_active?: boolean
    category_id?: string | null
    subcategory_id?: string | null
  }
) {
  try {
    await sql`UPDATE playbooks SET ${sql(payload as Record<string, unknown>, ...Object.keys(payload) as any)} WHERE id = ${playbookId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}


// ── Playbook Templates ───────────────────────────────────────────────────────

export interface PlaybookTemplate {
  id: string
  playbook_id: string
  template_name: string
  description: string | null
  file_url: string
  file_name: string
  created_at: string
}

export async function getPlaybookTemplates(playbookId: string) {
  try {
    const rows = await sql`SELECT id, playbook_id, template_name, description, file_url, file_name, created_at FROM playbook_templates WHERE playbook_id = ${playbookId} ORDER BY template_name ASC`
    return { data: rows as unknown as PlaybookTemplate[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertPlaybookTemplate(
  data: { playbook_id: string; template_name: string; description: string | null; file_url: string; file_name: string }
) {
  try {
    const rows = await sql`INSERT INTO playbook_templates ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} RETURNING *`
    return { data: rows[0] as PlaybookTemplate, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updatePlaybookTemplateById(
  id: string,
  data: { template_name: string; description: string | null }
) {
  try {
    const rows = await sql`UPDATE playbook_templates SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${id} RETURNING *`
    return { data: rows[0] as PlaybookTemplate, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deletePlaybookTemplateById(id: string) {
  try {
    await sql`DELETE FROM playbook_templates WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// ── Standalone playbooks (client-requestable programs) ───────────────────────

export interface StandalonePlaybook {
  id: string
  name: string
  playbook_type: string
  description: string | null
  state: string | null
  cost_display: string | null
  service_fee_display: string | null
  processing_time_display: string | null
  renewal_period_display: string | null
  icon_type: string | null
  requirements: string[] | null
  is_active: boolean
  category_id: string | null
  subcategory_id: string | null
  category: { id: string; name: string } | null
  subcategory: { id: string; name: string } | null
}

export async function getStandalonePlaybooksByState(state: string) {
  try {
    const rows = await sql`
      SELECT p.id, p.name, p.playbook_type, p.description, p.state,
        p.cost_display, p.service_fee_display, p.processing_time_display, p.renewal_period_display,
        p.icon_type, p.requirements, p.is_active, p.category_id, p.subcategory_id,
        lr.state AS lr_state,
        json_build_object('id', cat.id, 'name', cat.name) AS category,
        json_build_object('id', sub.id, 'name', sub.name) AS subcategory
      FROM playbooks p
      LEFT JOIN license_requirements lr ON lr.id = p.license_requirement_id
      LEFT JOIN configuration_values cat ON cat.id = p.category_id
      LEFT JOIN configuration_values sub ON sub.id = p.subcategory_id
      WHERE p.is_active = true
      ORDER BY p.name ASC
    `

    const filtered = (rows ?? []).filter((p: Record<string, unknown>) => {
      const lrState = p.lr_state as string | null
      const effectiveState = (p.state as string | null) ?? lrState ?? null
      return effectiveState === state || effectiveState === null
    })

    return { data: filtered as unknown as StandalonePlaybook[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// ── Cross-playbook copy helpers ───────────────────────────────────────────────

export async function getOtherPlaybooks(currentPlaybookId: string) {
  try {
    const rows = await sql`
      SELECT p.id, p.name, p.playbook_type, p.state, p.is_active,
        json_build_object('id', lr.id, 'state', lr.state, 'license_type', lr.license_type) AS license_requirement
      FROM playbooks p
      LEFT JOIN license_requirements lr ON lr.id = p.license_requirement_id
      WHERE p.id != ${currentPlaybookId} AND p.is_active = true
      ORDER BY p.name ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getAllPlaybookItemsWithPlaybookInfo(excludePlaybookId: string) {
  try {
    const rows = await sql`
      SELECT pi.id, pi.playbook_id, pi.item_order, pi.item_type, pi.name, pi.description, pi.instructions,
        pi.estimated_days, pi.document_type, pi.phase, pi.assignment, pi.requirement_type,
        pi.source_step_id, pi.source_document_id, pi.created_at, pi.updated_at,
        json_build_object(
          'id', p.id, 'name', p.name, 'state', p.state,
          'license_requirement', json_build_object('state', lr.state, 'license_type', lr.license_type)
        ) AS playbook
      FROM playbook_items pi
      LEFT JOIN playbooks p ON p.id = pi.playbook_id
      LEFT JOIN license_requirements lr ON lr.id = p.license_requirement_id
      WHERE pi.playbook_id != ${excludePlaybookId}
      ORDER BY pi.playbook_id, pi.item_order
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
