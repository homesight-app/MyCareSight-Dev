import sql from '@/db'

const LR_STEPS_COLUMNS = 'id, license_requirement_id, step_name, step_order, description, created_at, is_expert_step, phase, estimated_days, is_required, instructions'
const LR_DOCUMENTS_COLUMNS = 'id, license_requirement_id, document_name, document_type, is_required, created_at, description'
const LR_TEMPLATES_COLUMNS = 'id, license_requirement_id, template_name, description, file_url, file_name, created_at, category'
const LICENSE_TYPES_COLUMNS = 'id, state, name, description, cost_min, cost_max, cost_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements, is_active, created_at, updated_at, service_fee, service_fee_display'

// --- License requirement ---
export async function getLicenseRequirementByStateAndType(state: string, licenseTypeName: string) {
  try {
    const rows = await sql`SELECT id FROM license_requirements WHERE state = ${state} AND license_type = ${licenseTypeName} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertLicenseRequirement(state: string, licenseTypeName: string) {
  try {
    const rows = await sql`INSERT INTO license_requirements (state, license_type) VALUES (${state}, ${licenseTypeName}) RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get or create license requirement. Returns { id } or { error }. */
export async function getOrCreateLicenseRequirement(
  state: string,
  licenseTypeName: string
): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await getLicenseRequirementByStateAndType(state, licenseTypeName)
  if (existing) return { id: (existing as { id: string }).id }
  const { data: newRequirement, error } = await insertLicenseRequirement(state, licenseTypeName)
  if (error) return { error: `Failed to create license requirement: ${(error as Error).message}` }
  return { id: (newRequirement as { id: string }).id }
}

/** Get application ids that match a license requirement (state + license_type). */
export async function getApplicationIdsForRequirement(licenseRequirementId: string): Promise<string[]> {
  try {
    const lrRows = await sql`SELECT state, license_type FROM license_requirements WHERE id = ${licenseRequirementId} LIMIT 1`
    if (!lrRows.length) return []
    const lr = lrRows[0] as any

    const appsRows = await sql`SELECT id, license_type_id FROM applications WHERE state = ${lr.state}`
    if (!appsRows.length) return []

    const ltRows = await sql`SELECT id FROM license_types WHERE name = ${lr.license_type}`
    const licenseTypeIds = new Set((ltRows as unknown as { id: string }[]).map(lt => lt.id))

    const matching = (appsRows as unknown as { id: string; license_type_id?: string | null }[]).filter(
      (a) => a.license_type_id && licenseTypeIds.has(a.license_type_id)
    )
    return matching.map((a) => a.id)
  } catch {
    return []
  }
}

// --- Steps (license_requirement_steps) ---
export async function getMaxStepOrderRegular(licenseRequirementId: string) {
  try {
    const rows = await sql`SELECT step_order FROM license_requirement_steps WHERE license_requirement_id = ${licenseRequirementId} AND is_expert_step = false ORDER BY step_order DESC LIMIT 1`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getMaxStepOrderExpert(licenseRequirementId: string) {
  try {
    const rows = await sql`SELECT step_order FROM license_requirement_steps WHERE license_requirement_id = ${licenseRequirementId} AND is_expert_step = true ORDER BY step_order DESC LIMIT 1`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertStep(
  data: {
    license_requirement_id: string
    step_name: string
    step_order: number
    description: string | null
    instructions: string | null
    is_expert_step: boolean
    estimated_days: number | null
    is_required: boolean
    phase?: string | null
  }
) {
  try {
    const payload: Record<string, unknown> = {
      license_requirement_id: data.license_requirement_id,
      step_name: data.step_name,
      step_order: data.step_order,
      description: data.description,
      instructions: data.instructions ?? null,
      is_expert_step: data.is_expert_step,
      estimated_days: data.estimated_days,
      is_required: data.is_required,
    }
    if (data.phase !== undefined) payload.phase = data.phase
    const rows = await sql`INSERT INTO license_requirement_steps ${sql(payload, ...Object.keys(payload) as any)} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateStep(
  id: string,
  data: { step_name: string; description: string | null; estimated_days: number | null; is_required: boolean }
) {
  try {
    const rows = await sql`UPDATE license_requirement_steps SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${id} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateStepOrder(stepId: string, licenseRequirementId: string, stepOrder: number) {
  try {
    await sql`UPDATE license_requirement_steps SET step_order = ${stepOrder} WHERE id = ${stepId} AND license_requirement_id = ${licenseRequirementId} AND is_expert_step = false`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deleteStepById(id: string) {
  try {
    await sql`DELETE FROM license_requirement_steps WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// --- Documents ---
export async function insertDocument(
  data: {
    license_requirement_id: string
    document_name: string
    description: string | null
    is_required: boolean
  }
) {
  try {
    const payload = { ...data, document_type: null }
    const rows = await sql`INSERT INTO license_requirement_documents ${sql(payload as Record<string, unknown>, ...Object.keys(payload) as any)} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateDocument(
  id: string,
  data: { document_name: string; description: string | null; is_required: boolean }
) {
  try {
    const rows = await sql`UPDATE license_requirement_documents SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${id} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deleteDocumentById(id: string) {
  try {
    await sql`DELETE FROM license_requirement_documents WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// --- Expert steps: application_steps (live app steps) vs license_requirement_steps (template) ---
export async function updateExpertStepInApplication(
  id: string,
  data: { step_name: string; description: string | null; phase: string | null }
) {
  try {
    const rows = await sql`UPDATE application_steps SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${id} AND is_expert_step = true RETURNING *`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateExpertStepTemplate(
  stepId: string,
  data: { step_name: string; description: string | null; phase: string | null }
) {
  try {
    const rows = await sql`UPDATE license_requirement_steps SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${stepId} AND is_expert_step = true RETURNING *`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deleteExpertStepInApplication(id: string) {
  try {
    await sql`DELETE FROM application_steps WHERE id = ${id} AND is_expert_step = true`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deleteExpertStepTemplateById(stepId: string) {
  try {
    await sql`DELETE FROM license_requirement_steps WHERE id = ${stepId} AND is_expert_step = true`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// --- Expert step templates (read) ---
export async function getExpertStepTemplatesByRequirementId(requirementId: string) {
  try {
    const rows = await sql`SELECT step_name, step_order, description, instructions, phase FROM license_requirement_steps WHERE license_requirement_id = ${requirementId} AND is_expert_step = true ORDER BY step_order ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// --- Application steps: check existing expert steps, insert ---
export async function getExistingExpertStepsForApplication(applicationId: string) {
  try {
    const rows = await sql`SELECT id FROM application_steps WHERE application_id = ${applicationId} AND is_expert_step = true LIMIT 1`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertApplicationExpertSteps(
  rows: Array<{
    application_id: string
    step_name: string
    step_order: number
    description: string | null
    instructions: string | null
    phase: string | null
    is_expert_step: boolean
    is_completed: boolean
  }>
) {
  try {
    if (rows.length === 0) return { data: null, error: null }
    await sql`INSERT INTO application_steps ${sql(rows)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// --- GetAll / GetFromRequirement ---
export async function getAllLicenseRequirements() {
  try {
    const rows = await sql`SELECT id, state, license_type FROM license_requirements ORDER BY state ASC, license_type ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getStepsFromRequirement(requirementId: string) {
  try {
    const rows = await sql`SELECT id, license_requirement_id, step_name, step_order, description, created_at, is_expert_step, phase, estimated_days, is_required, instructions FROM license_requirement_steps WHERE license_requirement_id = ${requirementId} ORDER BY step_order ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Regular steps only (is_expert_step = false) for a requirement. */
export async function getRegularStepsFromRequirement(requirementId: string) {
  try {
    const rows = await sql`SELECT id, license_requirement_id, step_name, step_order, description, created_at, is_expert_step, phase, estimated_days, is_required, instructions FROM license_requirement_steps WHERE license_requirement_id = ${requirementId} AND is_expert_step = false ORDER BY step_order ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getAllStepsWithRequirementInfo(currentRequirementId?: string | null) {
  try {
    let rows: Record<string, unknown>[]
    if (currentRequirementId) {
      rows = await sql`
        SELECT s.id, s.step_name, s.step_order, s.description, s.estimated_days, s.is_required,
          s.license_requirement_id,
          json_build_object('state', lr.state, 'license_type', lr.license_type) AS license_requirements
        FROM license_requirement_steps s
        INNER JOIN license_requirements lr ON lr.id = s.license_requirement_id
        WHERE s.license_requirement_id != ${currentRequirementId}
        ORDER BY s.license_requirement_id, s.step_order ASC
      `
    } else {
      rows = await sql`
        SELECT s.id, s.step_name, s.step_order, s.description, s.estimated_days, s.is_required,
          s.license_requirement_id,
          json_build_object('state', lr.state, 'license_type', lr.license_type) AS license_requirements
        FROM license_requirement_steps s
        INNER JOIN license_requirements lr ON lr.id = s.license_requirement_id
        ORDER BY s.license_requirement_id, s.step_order ASC
      `
    }
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getAllDocumentsWithRequirementInfo(currentRequirementId?: string | null) {
  try {
    let rows: Record<string, unknown>[]
    if (currentRequirementId) {
      rows = await sql`
        SELECT d.id, d.document_name, d.document_type, d.description, d.is_required,
          d.license_requirement_id,
          json_build_object('state', lr.state, 'license_type', lr.license_type) AS license_requirements
        FROM license_requirement_documents d
        INNER JOIN license_requirements lr ON lr.id = d.license_requirement_id
        WHERE d.license_requirement_id != ${currentRequirementId}
        ORDER BY d.license_requirement_id, d.document_name ASC
      `
    } else {
      rows = await sql`
        SELECT d.id, d.document_name, d.document_type, d.description, d.is_required,
          d.license_requirement_id,
          json_build_object('state', lr.state, 'license_type', lr.license_type) AS license_requirements
        FROM license_requirement_documents d
        INNER JOIN license_requirements lr ON lr.id = d.license_requirement_id
        ORDER BY d.license_requirement_id, d.document_name ASC
      `
    }
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getDocumentsFromRequirement(requirementId: string) {
  try {
    const rows = await sql`SELECT id, license_requirement_id, document_name, document_type, is_required, created_at, description FROM license_requirement_documents WHERE license_requirement_id = ${requirementId} ORDER BY document_name ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getTemplatesFromRequirement(requirementId: string) {
  try {
    const rows = await sql`SELECT id, license_requirement_id, template_name, description, file_url, file_name, created_at, category FROM license_requirement_templates WHERE license_requirement_id = ${requirementId} ORDER BY template_name ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// --- Templates CRUD ---
export async function insertTemplate(
  data: { license_requirement_id: string; template_name: string; description: string | null; file_url: string; file_name: string }
) {
  try {
    const rows = await sql`INSERT INTO license_requirement_templates ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateTemplate(id: string, data: { template_name: string; description: string | null }) {
  try {
    const rows = await sql`UPDATE license_requirement_templates SET ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} WHERE id = ${id} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deleteTemplateById(id: string) {
  try {
    await sql`DELETE FROM license_requirement_templates WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// --- Copy steps/documents ---
export async function getLicenseRequirementStepsByIds(stepIds: string[]) {
  try {
    if (stepIds.length === 0) return { data: [], error: null }
    const rows = await sql`SELECT id, license_requirement_id, step_name, step_order, description, created_at, is_expert_step, phase, estimated_days, is_required, instructions FROM license_requirement_steps WHERE id = ANY(${stepIds as any})`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getLicenseRequirementDocumentsByIds(documentIds: string[]) {
  try {
    if (documentIds.length === 0) return { data: [], error: null }
    const rows = await sql`SELECT id, license_requirement_id, document_name, document_type, is_required, created_at, description FROM license_requirement_documents WHERE id = ANY(${documentIds as any})`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getMaxStepOrderExpertForRequirement(targetRequirementId: string) {
  try {
    const rows = await sql`SELECT step_order FROM license_requirement_steps WHERE license_requirement_id = ${targetRequirementId} AND is_expert_step = true ORDER BY step_order DESC LIMIT 1`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getMaxStepOrderRegularForRequirement(targetRequirementId: string) {
  try {
    const rows = await sql`SELECT step_order FROM license_requirement_steps WHERE license_requirement_id = ${targetRequirementId} AND is_expert_step = false ORDER BY step_order DESC LIMIT 1`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertLicenseRequirementSteps(rows: Record<string, unknown>[]) {
  try {
    if (rows.length === 0) return { data: [], error: null }
    const result = await sql`INSERT INTO license_requirement_steps ${sql(rows)} RETURNING *`
    return { data: result, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertLicenseRequirementDocuments(rows: Record<string, unknown>[]) {
  try {
    if (rows.length === 0) return { data: [], error: null }
    const result = await sql`INSERT INTO license_requirement_documents ${sql(rows)} RETURNING *`
    return { data: result, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// --- Expert steps from requirement / application_steps ---
export async function getExpertStepsFromRequirement(requirementId: string) {
  try {
    const rows = await sql`SELECT id, step_name, step_order, description, phase FROM license_requirement_steps WHERE license_requirement_id = ${requirementId} AND is_expert_step = true ORDER BY step_order ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getExpertStepsFromRequirementForCopy(requirementId: string, stepIds: string[]) {
  try {
    if (stepIds.length === 0) return { data: [], error: null }
    const rows = await sql`SELECT step_name, step_order, description, phase FROM license_requirement_steps WHERE license_requirement_id = ${requirementId} AND is_expert_step = true AND id = ANY(${stepIds as any}) ORDER BY step_order ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getExpertStepsFromApplicationSteps(stepIds: string[]) {
  try {
    if (stepIds.length === 0) return { data: [], error: null }
    const rows = await sql`SELECT step_name, step_order, description, phase FROM application_steps WHERE id = ANY(${stepIds as any}) AND is_expert_step = true`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getExpertStepTemplatesFromRequirementByIds(sourceExpertStepIds: string[]) {
  try {
    if (sourceExpertStepIds.length === 0) return { data: [], error: null }
    const rows = await sql`SELECT step_name, description, phase FROM license_requirement_steps WHERE id = ANY(${sourceExpertStepIds as any}) AND is_expert_step = true`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getApplicationStepsExpertByIds(sourceExpertStepIds: string[]) {
  try {
    if (sourceExpertStepIds.length === 0) return { data: [], error: null }
    const rows = await sql`SELECT step_name, description, phase FROM application_steps WHERE id = ANY(${sourceExpertStepIds as any}) AND is_expert_step = true`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getMaxApplicationExpertStepOrder(applicationId: string) {
  try {
    const rows = await sql`SELECT step_order FROM application_steps WHERE application_id = ${applicationId} AND is_expert_step = true ORDER BY step_order DESC LIMIT 1`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertApplicationSteps(rows: Record<string, unknown>[]) {
  try {
    if (rows.length === 0) return { data: null, error: null }
    await sql`INSERT INTO application_steps ${sql(rows)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getLicenseRequirementByStateAndTypeSingle(state: string, licenseTypeName: string) {
  try {
    const rows = await sql`SELECT id FROM license_requirements WHERE state = ${state} AND license_type = ${licenseTypeName} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// Used by getAllExpertStepsWithRequirementInfo
export async function getApplicationStepsExpertWithAppId() {
  try {
    const rows = await sql`SELECT id, step_name, step_order, description, phase, application_id FROM application_steps WHERE is_expert_step = true ORDER BY step_order ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getApplicationsByIds(appIds: string[]) {
  try {
    if (appIds.length === 0) return { data: [], error: null }
    const rows = await sql`SELECT id, state, license_type_id FROM applications WHERE id = ANY(${appIds as any})`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getLicenseTypesByIds(ltIds: string[]) {
  try {
    if (ltIds.length === 0) return { data: [], error: null }
    const rows = await sql`SELECT id, name FROM license_types WHERE id = ANY(${ltIds as any})`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license type by id (name, state). */
export async function getLicenseTypeById(id: string) {
  try {
    const rows = await sql`SELECT name, state FROM license_types WHERE id = ${id} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license type by id, full row. */
export async function getLicenseTypeByIdFull(id: string) {
  try {
    const rows = await sql`SELECT id, state, name, description, cost_min, cost_max, cost_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements, is_active, created_at, updated_at, service_fee, service_fee_display FROM license_types WHERE id = ${id}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license_requirement_documents for display (id, document_name, document_type, is_required). */
export async function getRequirementDocumentsForDisplay(requirementId: string) {
  try {
    const rows = await sql`SELECT id, document_name, document_type, is_required FROM license_requirement_documents WHERE license_requirement_id = ${requirementId} ORDER BY document_name ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license_requirement_templates for display. */
export async function getRequirementTemplatesForDisplay(requirementId: string) {
  try {
    const rows = await sql`SELECT id, template_name, description, file_url, file_name, created_at FROM license_requirement_templates WHERE license_requirement_id = ${requirementId} ORDER BY template_name ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get all license types (optionally filter by state, is_active). */
export async function getLicenseTypes(
  options?: { state?: string; isActive?: boolean }
) {
  try {
    let rows: Record<string, unknown>[]
    if (options?.state !== undefined && options?.isActive !== undefined) {
      rows = await sql`SELECT id, state, name, description, cost_min, cost_max, cost_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements, is_active, created_at, updated_at, service_fee, service_fee_display FROM license_types WHERE state = ${options.state} AND is_active = ${options.isActive} ORDER BY name ASC`
    } else if (options?.state !== undefined) {
      rows = await sql`SELECT id, state, name, description, cost_min, cost_max, cost_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements, is_active, created_at, updated_at, service_fee, service_fee_display FROM license_types WHERE state = ${options.state} ORDER BY name ASC`
    } else if (options?.isActive !== undefined) {
      rows = await sql`SELECT id, state, name, description, cost_min, cost_max, cost_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements, is_active, created_at, updated_at, service_fee, service_fee_display FROM license_types WHERE is_active = ${options.isActive} ORDER BY name ASC`
    } else {
      rows = await sql`SELECT id, state, name, description, cost_min, cost_max, cost_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements, is_active, created_at, updated_at, service_fee, service_fee_display FROM license_types ORDER BY name ASC`
    }
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license types by state (active only), ordered by name. */
export async function getLicenseTypesByState(state: string) {
  try {
    const rows = await sql`SELECT id, state, name, description, cost_min, cost_max, cost_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements, is_active, created_at, updated_at, service_fee, service_fee_display FROM license_types WHERE state = ${state} AND is_active = true ORDER BY name ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license types ordered by state then name (optional select for list page). */
export async function getLicenseTypesOrderedByStateAndName(select = LICENSE_TYPES_COLUMNS) {
  try {
    const rows = await sql.unsafe(`SELECT ${select} FROM license_types ORDER BY state ASC, name ASC`)
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get active license types only (optional select for config page). */
export async function getLicenseTypesActive(
  select = LICENSE_TYPES_COLUMNS
) {
  try {
    const rows = await sql.unsafe(`SELECT ${select} FROM license_types WHERE is_active = true ORDER BY state ASC, name ASC`)
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get requirement id by state and license_type name. */
export async function getRequirementIdByStateAndType(state: string, licenseTypeName: string) {
  try {
    const rows = await sql`SELECT id FROM license_requirements WHERE state = ${state} AND license_type = ${licenseTypeName} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get steps count and documents count for a license requirement. */
export async function getRequirementCounts(requirementId: string) {
  try {
    const [stepsRows, docsRows] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM license_requirement_steps WHERE license_requirement_id = ${requirementId}`,
      sql`SELECT COUNT(*) AS count FROM license_requirement_documents WHERE license_requirement_id = ${requirementId}`,
    ])
    return {
      steps: Number(stepsRows[0]?.count ?? 0),
      documents: Number(docsRows[0]?.count ?? 0),
    }
  } catch {
    return { steps: 0, documents: 0 }
  }
}
