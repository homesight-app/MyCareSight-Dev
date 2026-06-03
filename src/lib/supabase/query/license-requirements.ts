import type { Supabase } from '../types'

const LR_STEPS_COLUMNS = 'id, license_requirement_id, step_name, step_order, description, created_at, is_expert_step, phase, estimated_days, is_required, instructions'
const LR_DOCUMENTS_COLUMNS = 'id, license_requirement_id, document_name, document_type, is_required, created_at, description'
const LR_TEMPLATES_COLUMNS = 'id, license_requirement_id, template_name, description, file_url, file_name, created_at, category'
const LICENSE_TYPES_COLUMNS = 'id, state, name, description, cost_min, cost_max, cost_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements, is_active, created_at, updated_at, service_fee, service_fee_display'

// --- License requirement ---
export async function getLicenseRequirementByStateAndType(supabase: Supabase, state: string, licenseTypeName: string) {
  return supabase
    .from('license_requirements')
    .select('id')
    .eq('state', state)
    .eq('license_type', licenseTypeName)
    .maybeSingle()
}

export async function insertLicenseRequirement(supabase: Supabase, state: string, licenseTypeName: string) {
  return supabase
    .from('license_requirements')
    .insert({ state, license_type: licenseTypeName })
    .select()
    .single()
}

/** Get or create license requirement. Returns { id } or { error }. */
export async function getOrCreateLicenseRequirement(
  supabase: Supabase,
  state: string,
  licenseTypeName: string
): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await getLicenseRequirementByStateAndType(supabase, state, licenseTypeName)
  if (existing) return { id: existing.id }
  const { data: newRequirement, error } = await insertLicenseRequirement(supabase, state, licenseTypeName)
  if (error) return { error: `Failed to create license requirement: ${error.message}` }
  return { id: newRequirement!.id }
}

/** Get application ids that match a license requirement (state + license_type). */
export async function getApplicationIdsForRequirement(supabase: Supabase, licenseRequirementId: string): Promise<string[]> {
  const { data: lr, error: lrError } = await supabase
    .from('license_requirements')
    .select('state, license_type')
    .eq('id', licenseRequirementId)
    .maybeSingle()
  if (lrError || !lr) return []
  const { data: apps, error: appsError } = await supabase
    .from('applications')
    .select('id, license_type_id')
    .eq('state', lr.state)
  if (appsError || !apps?.length) return []
  const { data: licenseTypes } = await supabase
    .from('license_types')
    .select('id')
    .eq('name', lr.license_type)
  const licenseTypeIds = new Set((licenseTypes || []).map((lt: { id: string }) => lt.id))
  const matching = (apps as { id: string; license_type_id?: string | null }[]).filter(
    (a) => a.license_type_id && licenseTypeIds.has(a.license_type_id)
  )
  return matching.map((a) => a.id)
}

// --- Steps (license_requirement_steps) ---
export async function getMaxStepOrderRegular(supabase: Supabase, licenseRequirementId: string) {
  return supabase
    .from('license_requirement_steps')
    .select('step_order')
    .eq('license_requirement_id', licenseRequirementId)
    .eq('is_expert_step', false)
    .order('step_order', { ascending: false })
    .limit(1)
}

export async function getMaxStepOrderExpert(supabase: Supabase, licenseRequirementId: string) {
  return supabase
    .from('license_requirement_steps')
    .select('step_order')
    .eq('license_requirement_id', licenseRequirementId)
    .eq('is_expert_step', true)
    .order('step_order', { ascending: false })
    .limit(1)
}

export async function insertStep(
  supabase: Supabase,
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
  return supabase.from('license_requirement_steps').insert(payload).select().single()
}

export async function updateStep(
  supabase: Supabase,
  id: string,
  data: { step_name: string; description: string | null; estimated_days: number | null; is_required: boolean }
) {
  return supabase
    .from('license_requirement_steps')
    .update(data)
    .eq('id', id)
    .select()
    .single()
}

export async function updateStepOrder(supabase: Supabase, stepId: string, licenseRequirementId: string, stepOrder: number) {
  return supabase
    .from('license_requirement_steps')
    .update({ step_order: stepOrder })
    .eq('id', stepId)
    .eq('license_requirement_id', licenseRequirementId)
    .eq('is_expert_step', false)
}

export async function deleteStepById(supabase: Supabase, id: string) {
  return supabase.from('license_requirement_steps').delete().eq('id', id)
}

// --- Documents ---
export async function insertDocument(
  supabase: Supabase,
  data: {
    license_requirement_id: string
    document_name: string
    description: string | null
    is_required: boolean
  }
) {
  return supabase
    .from('license_requirement_documents')
    .insert({
      ...data,
      document_type: null,
    })
    .select()
    .single()
}

export async function updateDocument(
  supabase: Supabase,
  id: string,
  data: { document_name: string; description: string | null; is_required: boolean }
) {
  return supabase.from('license_requirement_documents').update(data).eq('id', id).select().single()
}

export async function deleteDocumentById(supabase: Supabase, id: string) {
  return supabase.from('license_requirement_documents').delete().eq('id', id)
}

// --- Expert steps: application_steps (live app steps) vs license_requirement_steps (template) ---
export async function updateExpertStepInApplication(
  supabase: Supabase,
  id: string,
  data: { step_name: string; description: string | null; phase: string | null }
) {
  return supabase
    .from('application_steps')
    .update(data)
    .eq('id', id)
    .eq('is_expert_step', true)
    .select()
    .single()
}

export async function updateExpertStepTemplate(
  supabase: Supabase,
  stepId: string,
  data: { step_name: string; description: string | null; phase: string | null }
) {
  return supabase
    .from('license_requirement_steps')
    .update(data)
    .eq('id', stepId)
    .eq('is_expert_step', true)
    .select()
    .single()
}

export async function deleteExpertStepInApplication(supabase: Supabase, id: string) {
  return supabase.from('application_steps').delete().eq('id', id).eq('is_expert_step', true)
}

export async function deleteExpertStepTemplateById(supabase: Supabase, stepId: string) {
  return supabase.from('license_requirement_steps').delete().eq('id', stepId).eq('is_expert_step', true)
}

// --- Expert step templates (read) ---
export async function getExpertStepTemplatesByRequirementId(supabase: Supabase, requirementId: string) {
  return supabase
    .from('license_requirement_steps')
    .select('step_name, step_order, description, instructions, phase')
    .eq('license_requirement_id', requirementId)
    .eq('is_expert_step', true)
    .order('step_order', { ascending: true })
}

// --- Application steps: check existing expert steps, insert ---
export async function getExistingExpertStepsForApplication(supabase: Supabase, applicationId: string) {
  return supabase
    .from('application_steps')
    .select('id')
    .eq('application_id', applicationId)
    .eq('is_expert_step', true)
    .limit(1)
}

export async function insertApplicationExpertSteps(
  supabase: Supabase,
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
  return supabase.from('application_steps').insert(rows)
}

// --- GetAll / GetFromRequirement ---
export async function getAllLicenseRequirements(supabase: Supabase) {
  return supabase
    .from('license_requirements')
    .select('id, state, license_type')
    .order('state', { ascending: true })
    .order('license_type', { ascending: true })
}

export async function getStepsFromRequirement(supabase: Supabase, requirementId: string) {
  return supabase
    .from('license_requirement_steps')
    .select(LR_STEPS_COLUMNS)
    .eq('license_requirement_id', requirementId)
    .order('step_order', { ascending: true })
}

/** Regular steps only (is_expert_step = false) for a requirement. */
export async function getRegularStepsFromRequirement(supabase: Supabase, requirementId: string) {
  return supabase
    .from('license_requirement_steps')
    .select(LR_STEPS_COLUMNS)
    .eq('license_requirement_id', requirementId)
    .eq('is_expert_step', false)
    .order('step_order', { ascending: true })
}

export async function getAllStepsWithRequirementInfo(supabase: Supabase, currentRequirementId?: string | null) {
  let query = supabase
    .from('license_requirement_steps')
    .select(`
      id,
      step_name,
      step_order,
      description,
      estimated_days,
      is_required,
      license_requirement_id,
      license_requirements!inner(state, license_type)
    `)
    .order('license_requirement_id')
    .order('step_order', { ascending: true })
  if (currentRequirementId) {
    query = query.neq('license_requirement_id', currentRequirementId)
  }
  return query
}

export async function getAllDocumentsWithRequirementInfo(supabase: Supabase, currentRequirementId?: string | null) {
  let query = supabase
    .from('license_requirement_documents')
    .select(`
      id,
      document_name,
      document_type,
      description,
      is_required,
      license_requirement_id,
      license_requirements!inner(state, license_type)
    `)
    .order('license_requirement_id')
    .order('document_name', { ascending: true })
  if (currentRequirementId) {
    query = query.neq('license_requirement_id', currentRequirementId)
  }
  return query
}

export async function getDocumentsFromRequirement(supabase: Supabase, requirementId: string) {
  return supabase
    .from('license_requirement_documents')
    .select(LR_DOCUMENTS_COLUMNS)
    .eq('license_requirement_id', requirementId)
    .order('document_name', { ascending: true })
}

export async function getTemplatesFromRequirement(supabase: Supabase, requirementId: string) {
  return supabase
    .from('license_requirement_templates')
    .select(LR_TEMPLATES_COLUMNS)
    .eq('license_requirement_id', requirementId)
    .order('template_name', { ascending: true })
}

// --- Templates CRUD ---
export async function insertTemplate(
  supabase: Supabase,
  data: { license_requirement_id: string; template_name: string; description: string | null; file_url: string; file_name: string }
) {
  return supabase.from('license_requirement_templates').insert(data).select().single()
}

export async function updateTemplate(supabase: Supabase, id: string, data: { template_name: string; description: string | null }) {
  return supabase.from('license_requirement_templates').update(data).eq('id', id).select().single()
}

export async function deleteTemplateById(supabase: Supabase, id: string) {
  return supabase.from('license_requirement_templates').delete().eq('id', id)
}

// --- Copy steps/documents ---
export async function getLicenseRequirementStepsByIds(supabase: Supabase, stepIds: string[]) {
  return supabase.from('license_requirement_steps').select(LR_STEPS_COLUMNS).in('id', stepIds)
}

export async function getLicenseRequirementDocumentsByIds(supabase: Supabase, documentIds: string[]) {
  return supabase.from('license_requirement_documents').select(LR_DOCUMENTS_COLUMNS).in('id', documentIds)
}

export async function getMaxStepOrderExpertForRequirement(supabase: Supabase, targetRequirementId: string) {
  return supabase
    .from('license_requirement_steps')
    .select('step_order')
    .eq('license_requirement_id', targetRequirementId)
    .eq('is_expert_step', true)
    .order('step_order', { ascending: false })
    .limit(1)
}

export async function getMaxStepOrderRegularForRequirement(supabase: Supabase, targetRequirementId: string) {
  return supabase
    .from('license_requirement_steps')
    .select('step_order')
    .eq('license_requirement_id', targetRequirementId)
    .eq('is_expert_step', false)
    .order('step_order', { ascending: false })
    .limit(1)
}

export async function insertLicenseRequirementSteps(supabase: Supabase, rows: Record<string, unknown>[]) {
  return supabase.from('license_requirement_steps').insert(rows).select()
}

export async function insertLicenseRequirementDocuments(supabase: Supabase, rows: Record<string, unknown>[]) {
  return supabase.from('license_requirement_documents').insert(rows).select()
}

// --- Expert steps from requirement / application_steps ---
export async function getExpertStepsFromRequirement(supabase: Supabase, requirementId: string) {
  return supabase
    .from('license_requirement_steps')
    .select('id, step_name, step_order, description, phase')
    .eq('license_requirement_id', requirementId)
    .eq('is_expert_step', true)
    .order('step_order', { ascending: true })
}

export async function getExpertStepsFromRequirementForCopy(supabase: Supabase, requirementId: string, stepIds: string[]) {
  return supabase
    .from('license_requirement_steps')
    .select('step_name, step_order, description, phase')
    .eq('license_requirement_id', requirementId)
    .eq('is_expert_step', true)
    .in('id', stepIds)
    .order('step_order', { ascending: true })
}

export async function getExpertStepsFromApplicationSteps(supabase: Supabase, stepIds: string[]) {
  return supabase
    .from('application_steps')
    .select('step_name, step_order, description, phase')
    .in('id', stepIds)
    .eq('is_expert_step', true)
}

export async function getExpertStepTemplatesFromRequirementByIds(supabase: Supabase, sourceExpertStepIds: string[]) {
  return supabase
    .from('license_requirement_steps')
    .select('step_name, description, phase')
    .in('id', sourceExpertStepIds)
    .eq('is_expert_step', true)
}

export async function getApplicationStepsExpertByIds(supabase: Supabase, sourceExpertStepIds: string[]) {
  return supabase
    .from('application_steps')
    .select('step_name, description, phase')
    .in('id', sourceExpertStepIds)
    .eq('is_expert_step', true)
}

export async function getMaxApplicationExpertStepOrder(supabase: Supabase, applicationId: string) {
  return supabase
    .from('application_steps')
    .select('step_order')
    .eq('application_id', applicationId)
    .eq('is_expert_step', true)
    .order('step_order', { ascending: false })
    .limit(1)
}

export async function insertApplicationSteps(supabase: Supabase, rows: Record<string, unknown>[]) {
  return supabase.from('application_steps').insert(rows)
}

export async function getLicenseRequirementByStateAndTypeSingle(supabase: Supabase, state: string, licenseTypeName: string) {
  return supabase
    .from('license_requirements')
    .select('id')
    .eq('state', state)
    .eq('license_type', licenseTypeName)
    .maybeSingle()
}

// Used by getAllExpertStepsWithRequirementInfo
export async function getApplicationStepsExpertWithAppId(supabase: Supabase) {
  return supabase
    .from('application_steps')
    .select('id, step_name, step_order, description, phase, application_id')
    .eq('is_expert_step', true)
    .order('step_order', { ascending: true })
}

export async function getApplicationsByIds(supabase: Supabase, appIds: string[]) {
  return supabase.from('applications').select('id, state, license_type_id').in('id', appIds)
}

export async function getLicenseTypesByIds(supabase: Supabase, ltIds: string[]) {
  return supabase.from('license_types').select('id, name').in('id', ltIds)
}

/** Get license type by id (name, state). */
export async function getLicenseTypeById(supabase: Supabase, id: string) {
  return supabase.from('license_types').select('name, state').eq('id', id).maybeSingle()
}

/** Get license type by id, full row. */
export async function getLicenseTypeByIdFull(supabase: Supabase, id: string) {
  return supabase.from('license_types').select(LICENSE_TYPES_COLUMNS).eq('id', id).single()
}

/** Get license_requirement_documents for display (id, document_name, document_type, is_required). */
export async function getRequirementDocumentsForDisplay(supabase: Supabase, requirementId: string) {
  return supabase
    .from('license_requirement_documents')
    .select('id, document_name, document_type, is_required')
    .eq('license_requirement_id', requirementId)
    .order('document_name', { ascending: true })
}

/** Get license_requirement_templates for display. */
export async function getRequirementTemplatesForDisplay(supabase: Supabase, requirementId: string) {
  return supabase
    .from('license_requirement_templates')
    .select('id, template_name, description, file_url, file_name, created_at')
    .eq('license_requirement_id', requirementId)
    .order('template_name', { ascending: true })
}

/** Get all license types (optionally filter by state, is_active). */
export async function getLicenseTypes(
  supabase: Supabase,
  options?: { state?: string; isActive?: boolean }
) {
  let q = supabase.from('license_types').select(LICENSE_TYPES_COLUMNS).order('name', { ascending: true })
  if (options?.state) q = q.eq('state', options.state)
  if (options?.isActive !== undefined) q = q.eq('is_active', options.isActive)
  return q
}

/** Get license types by state (active only), ordered by name. */
export async function getLicenseTypesByState(supabase: Supabase, state: string) {
  return supabase
    .from('license_types')
    .select(LICENSE_TYPES_COLUMNS)
    .eq('state', state)
    .eq('is_active', true)
    .order('name', { ascending: true })
}

/** Get license types ordered by state then name (optional select for list page). */
export async function getLicenseTypesOrderedByStateAndName(supabase: Supabase, select = LICENSE_TYPES_COLUMNS) {
  return supabase
    .from('license_types')
    .select(select)
    .order('state', { ascending: true })
    .order('name', { ascending: true })
}

/** Get active license types only (optional select for config page). */
export async function getLicenseTypesActive(
  supabase: Supabase,
  select = LICENSE_TYPES_COLUMNS
) {
  return supabase
    .from('license_types')
    .select(select)
    .eq('is_active', true)
    .order('state', { ascending: true })
    .order('name', { ascending: true })
}

/** Get requirement id by state and license_type name. */
export async function getRequirementIdByStateAndType(supabase: Supabase, state: string, licenseTypeName: string) {
  return supabase
    .from('license_requirements')
    .select('id')
    .eq('state', state)
    .eq('license_type', licenseTypeName)
    .maybeSingle()
}

/** Get steps count and documents count for a license requirement. */
export async function getRequirementCounts(supabase: Supabase, requirementId: string) {
  const [stepsRes, docsRes] = await Promise.all([
    supabase
      .from('license_requirement_steps')
      .select('*', { count: 'exact', head: true })
      .eq('license_requirement_id', requirementId),
    supabase
      .from('license_requirement_documents')
      .select('*', { count: 'exact', head: true })
      .eq('license_requirement_id', requirementId),
  ])
  return {
    steps: stepsRes.count ?? 0,
    documents: docsRes.count ?? 0,
  }
}
