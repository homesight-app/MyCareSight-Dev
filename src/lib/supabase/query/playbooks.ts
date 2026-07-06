import type { Supabase } from '../types'

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

export async function getPlaybookByRequirementId(supabase: Supabase, licenseRequirementId: string) {
  return supabase
    .from('playbooks')
    .select('id, name, playbook_type, description, license_requirement_id, is_active, created_at')
    .eq('license_requirement_id', licenseRequirementId)
    .maybeSingle()
}

export async function insertPlaybook(
  supabase: Supabase,
  payload: { name: string; license_requirement_id: string; created_by: string }
) {
  return supabase
    .from('playbooks')
    .insert({
      name: payload.name,
      playbook_type: 'license_requirement',
      license_requirement_id: payload.license_requirement_id,
      created_by: payload.created_by,
      updated_at: new Date().toISOString(),
    })
    .select('id, name, playbook_type, description, license_requirement_id, is_active, created_at')
    .single()
}

export async function getPlaybookItems(supabase: Supabase, playbookId: string) {
  return supabase
    .from('playbook_items')
    .select('id, playbook_id, item_order, item_type, name, description, instructions, estimated_days, document_type, phase, assignment, requirement_type, source_step_id, source_document_id, created_at, updated_at')
    .eq('playbook_id', playbookId)
    .order('item_order', { ascending: true })
}

export async function insertPlaybookItem(
  supabase: Supabase,
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
  return supabase
    .from('playbook_items')
    .insert({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .select('id, playbook_id, item_order, item_type, name, description, instructions, estimated_days, document_type, phase, assignment, requirement_type, source_step_id, source_document_id, created_at, updated_at')
    .single()
}

export async function bulkInsertPlaybookItems(
  supabase: Supabase,
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
  const now = new Date().toISOString()
  return supabase
    .from('playbook_items')
    .insert(items.map(item => ({ ...item, updated_at: now })))
}

export async function updatePlaybookItem(
  supabase: Supabase,
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
  return supabase
    .from('playbook_items')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', itemId)
}

export async function deletePlaybookItem(supabase: Supabase, itemId: string) {
  return supabase.from('playbook_items').delete().eq('id', itemId)
}

export async function reorderPlaybookItems(supabase: Supabase, orderedIds: string[]) {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('playbook_items')
      .update({ item_order: index + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
  )
  const results = await Promise.all(updates)
  const err = results.find(r => r.error)
  return err ? { error: err.error } : { error: null }
}

// ─── Validation rules ────────────────────────────────────────────────────────

export async function getValidationRuleLibrary(supabase: Supabase) {
  return supabase
    .from('validation_rules')
    .select('id, name, description, field_key, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
}

export async function getPlaybookItemValidationRules(supabase: Supabase, playbookItemId: string) {
  return supabase
    .from('playbook_item_validation_rules')
    .select('id, playbook_item_id, validation_rule_id, rule_order, is_required')
    .eq('playbook_item_id', playbookItemId)
    .order('rule_order', { ascending: true })
}

export async function setPlaybookItemValidationRules(
  supabase: Supabase,
  playbookItemId: string,
  rules: Array<{ validation_rule_id: string; rule_order: number; is_required: boolean }>
) {
  // Replace: delete existing then bulk insert selected
  const { error: deleteErr } = await supabase
    .from('playbook_item_validation_rules')
    .delete()
    .eq('playbook_item_id', playbookItemId)

  if (deleteErr) return { error: deleteErr }
  if (rules.length === 0) return { error: null }

  const { error: insertErr } = await supabase
    .from('playbook_item_validation_rules')
    .insert(rules.map(r => ({ ...r, playbook_item_id: playbookItemId })))

  return { error: insertErr ?? null }
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
  status: 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'
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

export async function getApplicationPlaybookItems(supabase: Supabase, applicationId: string) {
  return supabase
    .from('application_playbook_items')
    .select(APP_PLAYBOOK_ITEM_SELECT)
    .eq('application_id', applicationId)
    .order('item_order', { ascending: true })
}

export async function updateApplicationPlaybookItemRow(
  supabase: Supabase,
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
  return supabase
    .from('application_playbook_items')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', itemId)
}

export async function bulkInsertApplicationPlaybookItems(
  supabase: Supabase,
  items: Omit<ApplicationPlaybookItem, 'id' | 'created_at' | 'updated_at'>[]
) {
  const now = new Date().toISOString()
  return supabase
    .from('application_playbook_items')
    .insert(items.map(item => ({ ...item, updated_at: now })))
}

export async function getApplicationPlaybookItemCount(supabase: Supabase, applicationId: string) {
  return supabase
    .from('application_playbook_items')
    .select('id', { count: 'exact', head: true })
    .eq('application_id', applicationId)
}

export async function getRuleChecksForApplicationItem(supabase: Supabase, applicationPlaybookItemId: string) {
  return supabase
    .from('application_playbook_item_rule_checks')
    .select('id, application_playbook_item_id, validation_rule_id, rule_name, field_key, description, rule_order, is_required, is_checked, checked_by, checked_at, notes')
    .eq('application_playbook_item_id', applicationPlaybookItemId)
    .order('rule_order', { ascending: true })
}

export async function updateApplicationRuleCheck(
  supabase: Supabase,
  ruleCheckId: string,
  payload: {
    is_checked: boolean
    checked_by: string | null
    checked_at: string | null
    notes?: string | null
  }
) {
  return supabase
    .from('application_playbook_item_rule_checks')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', ruleCheckId)
}

export async function getDocumentsByPlaybookItem(supabase: Supabase, applicationPlaybookItemId: string) {
  return supabase
    .from('application_documents')
    .select('id, document_name, document_url, document_type, status, description, expert_review_notes, created_at')
    .eq('application_playbook_item_id', applicationPlaybookItemId)
    .order('created_at', { ascending: false })
}

export async function getApplicationsWithPrograms(supabase: Supabase, expertId?: string) {
  let query = supabase
    .from('applications')
    .select(`
      id, application_name, state, status, agency_id, assigned_expert_id,
      agencies(id, name),
      application_playbook_items(status, requirement_type)
    `)
    .order('created_at', { ascending: false })

  if (expertId) {
    query = query.eq('assigned_expert_id', expertId)
  }

  return query
}

// ─── Rule check management ────────────────────────────────────────────────────

export async function insertApplicationRuleCheck(
  supabase: Supabase,
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
  return supabase
    .from('application_playbook_item_rule_checks')
    .insert({ ...payload, is_checked: true })
    .select('id, application_playbook_item_id, validation_rule_id, rule_name, field_key, description, rule_order, is_required, is_checked, checked_by, checked_at, notes')
    .single()
}

export async function deleteApplicationRuleCheck(supabase: Supabase, ruleCheckId: string) {
  return supabase
    .from('application_playbook_item_rule_checks')
    .delete()
    .eq('id', ruleCheckId)
}

export async function resetApplicationRuleChecks(supabase: Supabase, applicationPlaybookItemId: string) {
  return supabase
    .from('application_playbook_item_rule_checks')
    .update({ is_checked: false, checked_by: null, checked_at: null, notes: null, updated_at: new Date().toISOString() })
    .eq('application_playbook_item_id', applicationPlaybookItemId)
}

export async function bulkUpdateApplicationRuleChecks(
  supabase: Supabase,
  updates: Array<{ id: string; is_checked: boolean; checked_by: string; checked_at: string; notes: string | null }>
) {
  const results = await Promise.all(
    updates.map(u =>
      supabase
        .from('application_playbook_item_rule_checks')
        .update({ is_checked: u.is_checked, checked_by: u.checked_by, checked_at: u.checked_at, notes: u.notes, updated_at: new Date().toISOString() })
        .eq('id', u.id)
    )
  )
  const err = results.find(r => r.error)
  return err ? { error: err.error } : { error: null }
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
  supabase: Supabase,
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
  return supabase
    .from('validation_runs')
    .insert(payload)
    .select('id, application_playbook_item_id, run_number, extraction_status, completed_at, completed_by, passed_count, failed_count, needs_review_count, results, created_at')
    .single()
}

export async function getValidationRunsForItem(supabase: Supabase, applicationPlaybookItemId: string) {
  return supabase
    .from('validation_runs')
    .select('id, application_playbook_item_id, run_number, extraction_status, completed_at, completed_by, passed_count, failed_count, needs_review_count, results, created_at')
    .eq('application_playbook_item_id', applicationPlaybookItemId)
    .order('run_number', { ascending: false })
}

// ── Playbook Library ──────────────────────────────────────────────────────────

export async function getAllPlaybooks(supabase: Supabase) {
  return supabase
    .from('playbooks')
    .select(`
      id, name, playbook_type, description, is_active,
      state, cost_display, processing_time_display, renewal_period_display, icon_type,
      created_at,
      license_requirement:license_requirement_id(id, state, license_type),
      playbook_items(count)
    `)
    .order('created_at', { ascending: false })
}

export async function getPlaybookById(supabase: Supabase, playbookId: string) {
  return supabase
    .from('playbooks')
    .select(`
      id, name, playbook_type, description, is_active,
      state, cost_min, cost_max, cost_display,
      service_fee, service_fee_display,
      processing_time_min, processing_time_max, processing_time_display,
      renewal_period_years, renewal_period_display,
      icon_type, requirements, created_by, created_at, updated_at,
      license_requirement:license_requirement_id(id, state, license_type)
    `)
    .eq('id', playbookId)
    .single()
}

export async function getPlaybooksWithRequirements(supabase: Supabase) {
  return supabase
    .from('playbooks')
    .select('id, license_requirement:license_requirement_id(state, license_type)')
    .eq('is_active', true)
}

export async function insertPlaybookRecord(
  supabase: Supabase,
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
  }
) {
  return supabase
    .from('playbooks')
    .insert(payload)
    .select('id')
    .single()
}

export async function updatePlaybookRecord(
  supabase: Supabase,
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
  }
) {
  return supabase
    .from('playbooks')
    .update(payload)
    .eq('id', playbookId)
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

export async function getPlaybookTemplates(supabase: Supabase, playbookId: string) {
  return supabase
    .from('playbook_templates')
    .select('id, playbook_id, template_name, description, file_url, file_name, created_at')
    .eq('playbook_id', playbookId)
    .order('template_name', { ascending: true })
    .returns<PlaybookTemplate[]>()
}

export async function insertPlaybookTemplate(
  supabase: Supabase,
  data: { playbook_id: string; template_name: string; description: string | null; file_url: string; file_name: string }
) {
  return supabase.from('playbook_templates').insert(data).select().single()
}

export async function updatePlaybookTemplateById(
  supabase: Supabase,
  id: string,
  data: { template_name: string; description: string | null }
) {
  return supabase.from('playbook_templates').update(data).eq('id', id).select().single()
}

export async function deletePlaybookTemplateById(supabase: Supabase, id: string) {
  return supabase.from('playbook_templates').delete().eq('id', id)
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
}

export async function getStandalonePlaybooksByState(supabase: Supabase, state: string) {
  return supabase
    .from('playbooks')
    .select('id, name, playbook_type, description, state, cost_display, service_fee_display, processing_time_display, renewal_period_display, icon_type, requirements, is_active')
    .eq('state', state)
    .eq('is_active', true)
    .order('name')
    .returns<StandalonePlaybook[]>()
}

// ── Cross-playbook copy helpers ───────────────────────────────────────────────

export async function getOtherPlaybooks(supabase: Supabase, currentPlaybookId: string) {
  return supabase
    .from('playbooks')
    .select('id, name, playbook_type, state, is_active, license_requirement:license_requirement_id(id, state, license_type)')
    .neq('id', currentPlaybookId)
    .eq('is_active', true)
    .order('name')
}

export async function getAllPlaybookItemsWithPlaybookInfo(supabase: Supabase, excludePlaybookId: string) {
  return supabase
    .from('playbook_items')
    .select(`
      id, playbook_id, item_order, item_type, name, description, instructions,
      estimated_days, document_type, phase, assignment, requirement_type,
      source_step_id, source_document_id, created_at, updated_at,
      playbook:playbook_id(id, name, state, license_requirement:license_requirement_id(state, license_type))
    `)
    .neq('playbook_id', excludePlaybookId)
    .order('playbook_id')
    .order('item_order')
}
