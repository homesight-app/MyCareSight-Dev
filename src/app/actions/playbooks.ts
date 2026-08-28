'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import type { PlaybookItem, ValidationRule } from '@/lib/supabase/query/playbooks'
import { removeFiles } from '@/lib/storage/client'
import { STORAGE_BUCKET } from '@/lib/supabase/storage'

export type OtherPlaybook = {
  id: string
  name: string
  playbook_type: string
  state: string | null
  is_active: boolean
  license_requirement: { id: string; state: string; license_type: string } | null
}

export type PlaybookItemWithPlaybook = PlaybookItem & {
  playbook: {
    id: string
    name: string
    state: string | null
    license_requirement: { state: string; license_type: string } | null
  } | null
}

async function requireStaff() {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', session: null }
  return { error: null, session }
}

/** Get an existing playbook for a license requirement, or create one pre-populated from the license type. */
export async function getOrCreatePlaybook(licenseRequirementId: string) {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden', playbook: null }

  const supabase = await createClient()

  const { data: existing } = await q.getPlaybookByRequirementId(supabase, licenseRequirementId)
  if (existing) return { error: null, playbook: existing }

  const { data: lr } = await supabase
    .from('license_requirements')
    .select('state, license_type')
    .eq('id', licenseRequirementId)
    .maybeSingle()

  const name = lr ? `${lr.state} – ${lr.license_type}` : 'Playbook'

  // Pre-populate all display fields from the matching license type
  let ltFields: Partial<Parameters<typeof q.insertPlaybook>[1]> = {}
  if (lr?.license_type) {
    const { data: lt } = await supabase
      .from('license_types')
      .select('description, cost_min, cost_max, cost_display, service_fee, service_fee_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements')
      .eq('name', lr.license_type)
      .maybeSingle()
    if (lt) ltFields = lt
  }

  const { data, error } = await q.insertPlaybook(supabase, {
    name,
    license_requirement_id: licenseRequirementId,
    state: lr?.state ?? null,
    created_by: session.user.id,
    ...ltFields,
  })

  if (error) return { error: error.message, playbook: null }
  return { error: null, playbook: data }
}

/** Fetch all items for a playbook, ordered by item_order. */
export async function getPlaybookItems(playbookId: string): Promise<{ error: string | null; items: PlaybookItem[] }> {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, items: [] }

  const supabase = await createClient()
  const { data, error } = await q.getPlaybookItems(supabase, playbookId)
  if (error) return { error: error.message, items: [] }
  return { error: null, items: (data ?? []) as PlaybookItem[] }
}

/**
 * One-time import: reads existing steps + documents from a license requirement
 * and creates playbook_items for each one (in order: steps first, then documents).
 * Safe to call if items already exist — checks count first.
 */
export async function importFromRequirement(playbookId: string, licenseRequirementId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()

  // Guard: don't double-import
  const { data: existing } = await q.getPlaybookItems(supabase, playbookId)
  if (existing && existing.length > 0) return { error: 'Playbook already has items' }

  const [stepsRes, docsRes] = await Promise.all([
    supabase
      .from('license_requirement_steps')
      .select('id, step_name, step_order, description, instructions, estimated_days, is_required, is_expert_step, phase')
      .eq('license_requirement_id', licenseRequirementId)
      .order('step_order', { ascending: true }),
    supabase
      .from('license_requirement_documents')
      .select('id, document_name, document_type, description, is_required')
      .eq('license_requirement_id', licenseRequirementId),
  ])

  const steps = stepsRes.data ?? []
  const docs = docsRes.data ?? []

  if (steps.length === 0 && docs.length === 0) return { error: 'No steps or documents to import' }

  let order = 1
  const items: Parameters<typeof q.bulkInsertPlaybookItems>[1] = []

  for (const s of steps) {
    items.push({
      playbook_id: playbookId,
      item_order: order++,
      item_type: 'step',
      name: s.step_name,
      description: s.description ?? null,
      instructions: s.instructions ?? null,
      estimated_days: s.estimated_days ?? null,
      document_type: null,
      phase: s.phase ?? null,
      assignment: s.is_expert_step ? 'expert' : 'client',
      requirement_type: s.is_required ? 'required' : 'optional',
      source_step_id: s.id,
      source_document_id: null,
    })
  }

  for (const d of docs) {
    items.push({
      playbook_id: playbookId,
      item_order: order++,
      item_type: 'document',
      name: d.document_name,
      description: d.description ?? null,
      instructions: null,
      estimated_days: null,
      document_type: d.document_type ?? null,
      phase: null,
      assignment: 'client',
      requirement_type: d.is_required ? 'required' : 'optional',
      source_step_id: null,
      source_document_id: d.id,
    })
  }

  const { error } = await q.bulkInsertPlaybookItems(supabase, items)
  if (error) return { error: error.message }

  // ── General Info + Templates are best-effort — don't fail the whole import ─
  try {
    const [lrRes, lrTemplatesRes] = await Promise.all([
      supabase
        .from('license_requirements')
        .select('state, license_type')
        .eq('id', licenseRequirementId)
        .maybeSingle(),
      supabase
        .from('license_requirement_templates')
        .select('template_name, description, file_url, file_name')
        .eq('license_requirement_id', licenseRequirementId),
    ])

    if (lrRes.data) {
      const { data: lt } = await supabase
        .from('license_types')
        .select('description, cost_min, cost_max, cost_display, service_fee, service_fee_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements')
        .eq('name', lrRes.data.license_type)
        .maybeSingle()

      if (lt) {
        await q.updatePlaybookRecord(supabase, playbookId, {
          description: lt.description,
          cost_min: lt.cost_min,
          cost_max: lt.cost_max,
          cost_display: lt.cost_display,
          service_fee: lt.service_fee,
          service_fee_display: lt.service_fee_display,
          processing_time_min: lt.processing_time_min,
          processing_time_max: lt.processing_time_max,
          processing_time_display: lt.processing_time_display,
          renewal_period_years: lt.renewal_period_years,
          renewal_period_display: lt.renewal_period_display,
          icon_type: lt.icon_type,
          requirements: lt.requirements,
        })
      }
    }

    const lrTemplates = lrTemplatesRes.data ?? []
    if (lrTemplates.length > 0) {
      await supabase
        .from('playbook_templates')
        .insert(lrTemplates.map(t => ({
          playbook_id: playbookId,
          template_name: t.template_name,
          description: t.description ?? null,
          file_url: t.file_url,
          file_name: t.file_name,
        })))
    }
  } catch {
    // General info / template import is non-critical — items already committed above
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, count: items.length }
}

/** Add a single item to a playbook (appended at end). */
export async function addPlaybookItem(
  playbookId: string,
  payload: {
    item_type: 'step' | 'document'
    name: string
    description?: string | null
    instructions?: string | null
    estimated_days?: number | null
    document_type?: string | null
    phase?: string | null
    assignment: 'client' | 'expert' | 'both'
    requirement_type: 'required' | 'optional'
  }
) {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden', item: null }

  const supabase = await createClient()

  // Get max order
  const { data: existing } = await q.getPlaybookItems(supabase, playbookId)
  const maxOrder = existing && existing.length > 0
    ? Math.max(...existing.map((i: PlaybookItem) => i.item_order))
    : 0

  const { data, error } = await q.insertPlaybookItem(supabase, {
    playbook_id: playbookId,
    item_order: maxOrder + 1,
    ...payload,
  })

  if (error) return { error: error.message, item: null }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: null,
    table_name: 'playbook_items',
    record_id: (data as { id: string } | null)?.id ?? playbookId,
    action: 'CREATE',
    performed_by_user_id: session.user.id,
    details: { playbook_id: playbookId, item_type: payload.item_type, name: payload.name },
  })
  if (auditErr) console.error('[playbooks/addPlaybookItem] Audit log failed. playbookId=%s err=%s', playbookId, auditErr.message)

  return { error: null, item: data }
}

/** Update an existing playbook item's attributes or content. */
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
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = await createClient()
  const { error } = await q.updatePlaybookItem(supabase, itemId, payload)
  if (error) return { error: error.message }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: null,
    table_name: 'playbook_items',
    record_id: itemId,
    action: 'UPDATE',
    performed_by_user_id: session.user.id,
    details: { fields_updated: Object.keys(payload) },
  })
  if (auditErr) console.error('[playbooks/updatePlaybookItem] Audit log failed. itemId=%s err=%s', itemId, auditErr.message)

  return { error: null }
}

/** Delete a playbook item. */
export async function deletePlaybookItem(itemId: string) {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = await createClient()
  const { error } = await q.deletePlaybookItem(supabase, itemId)
  if (error) return { error: error.message }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: null,
    table_name: 'playbook_items',
    record_id: itemId,
    action: 'DELETE',
    performed_by_user_id: session.user.id,
    details: {},
  })
  if (auditErr) console.error('[playbooks/deletePlaybookItem] Audit log failed. itemId=%s err=%s', itemId, auditErr.message)

  return { error: null }
}

/** Fetch the active validation rule library (small, cacheable). */
export async function getValidationRuleLibrary(): Promise<{ error: string | null; rules: ValidationRule[] }> {
  const supabase = await createClient()
  const { data, error } = await q.getValidationRuleLibrary(supabase)
  if (error) return { error: error.message, rules: [] }
  return { error: null, rules: (data ?? []) as ValidationRule[] }
}

/** Get current validation rule selections for a playbook item. */
export async function getPlaybookItemRules(playbookItemId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, ruleIds: [] as string[] }

  const supabase = await createClient()
  const { data, error } = await q.getPlaybookItemValidationRules(supabase, playbookItemId)
  if (error) return { error: error.message, ruleIds: [] as string[] }
  return { error: null, ruleIds: (data ?? []).map((r: { validation_rule_id: string }) => r.validation_rule_id) }
}

/**
 * Replace the validation rules for a playbook document item.
 * selectedRuleIds should be in the desired display order.
 */
export async function setPlaybookItemRules(playbookItemId: string, selectedRuleIds: string[]) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const rules = selectedRuleIds.map((validation_rule_id, idx) => ({
    validation_rule_id,
    rule_order: idx + 1,
    is_required: true,
  }))
  const { error } = await q.setPlaybookItemValidationRules(supabase, playbookItemId, rules)
  if (error) return { error: (error as { message: string }).message }
  return { error: null }
}

/** Copy items from other playbooks into the target playbook (staff only). */
export async function copyPlaybookItems(
  targetPlaybookId: string,
  sourceItemIds: string[]
): Promise<{ error: string | null; items: PlaybookItem[] }> {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, items: [] }

  if (sourceItemIds.length === 0) return { error: 'No items selected', items: [] }

  const supabase = await createClient()

  const ITEM_SELECT = 'id, playbook_id, item_order, item_type, name, description, instructions, estimated_days, document_type, phase, assignment, requirement_type, source_step_id, source_document_id, created_at, updated_at'

  // 1. Fetch source items
  const { data: sourceItems, error: fetchErr } = await supabase
    .from('playbook_items')
    .select('id, item_type, name, description, instructions, estimated_days, document_type, phase, assignment, requirement_type')
    .in('id', sourceItemIds)
    .order('item_order', { ascending: true })

  if (fetchErr || !sourceItems || sourceItems.length === 0) {
    return { error: fetchErr?.message ?? 'No items found', items: [] }
  }

  // 2. Fetch validation rules for source items
  const { data: sourceRules } = await supabase
    .from('playbook_item_validation_rules')
    .select('playbook_item_id, validation_rule_id, rule_order, is_required')
    .in('playbook_item_id', sourceItemIds)

  const rulesByItem: Record<string, Array<{ validation_rule_id: string; rule_order: number; is_required: boolean }>> = {}
  for (const rule of sourceRules ?? []) {
    if (!rulesByItem[rule.playbook_item_id]) rulesByItem[rule.playbook_item_id] = []
    rulesByItem[rule.playbook_item_id].push({
      validation_rule_id: rule.validation_rule_id,
      rule_order: rule.rule_order,
      is_required: rule.is_required,
    })
  }

  // 3. Get max item_order for target playbook
  const { data: existing } = await q.getPlaybookItems(supabase, targetPlaybookId)
  const maxOrder = existing && existing.length > 0
    ? Math.max(...(existing as PlaybookItem[]).map(i => i.item_order))
    : 0

  // 4. Insert new items and get back their IDs
  const now = new Date().toISOString()
  const insertPayloads = sourceItems.map((item, idx) => ({
    playbook_id: targetPlaybookId,
    item_order: maxOrder + idx + 1,
    item_type: item.item_type as 'step' | 'document',
    name: item.name,
    description: item.description ?? null,
    instructions: item.instructions ?? null,
    estimated_days: item.estimated_days ?? null,
    document_type: item.document_type ?? null,
    phase: item.phase ?? null,
    assignment: item.assignment as 'client' | 'expert' | 'both',
    requirement_type: item.requirement_type as 'required' | 'optional',
    source_step_id: null,
    source_document_id: null,
    updated_at: now,
  }))

  const { data: insertedItems, error: insertErr } = await supabase
    .from('playbook_items')
    .insert(insertPayloads)
    .select(ITEM_SELECT)

  if (insertErr || !insertedItems) {
    return { error: insertErr?.message ?? 'Insert failed', items: [] }
  }

  // 5. Copy validation rules preserving order
  const ruleInserts: Array<{ playbook_item_id: string; validation_rule_id: string; rule_order: number; is_required: boolean }> = []
  for (let i = 0; i < sourceItems.length; i++) {
    const sourceId = sourceItems[i].id
    const newItem = insertedItems[i]
    if (!newItem || !rulesByItem[sourceId]) continue
    for (const rule of rulesByItem[sourceId]) {
      ruleInserts.push({ playbook_item_id: newItem.id, ...rule })
    }
  }
  if (ruleInserts.length > 0) {
    await supabase.from('playbook_item_validation_rules').insert(ruleInserts)
  }

  revalidatePath('/pages/admin/playbooks')
  revalidatePath('/pages/admin/license-requirements')

  return { error: null, items: insertedItems as PlaybookItem[] }
}

/** Fetch all active playbooks except the current one (for Copy tab dropdown). */
export async function getOtherPlaybooksForCopy(currentPlaybookId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, playbooks: [] as OtherPlaybook[] }

  const supabase = await createClient()
  const { data, error } = await q.getOtherPlaybooks(supabase, currentPlaybookId)
  if (error) return { error: error.message, playbooks: [] as OtherPlaybook[] }
  return { error: null, playbooks: (data ?? []) as unknown as OtherPlaybook[] }
}

/** Fetch all playbook items from all other playbooks with playbook metadata (for Browse tab). */
export async function getAllItemsForBrowse(excludePlaybookId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, items: [] as PlaybookItemWithPlaybook[] }

  const supabase = await createClient()
  const { data, error } = await q.getAllPlaybookItemsWithPlaybookInfo(supabase, excludePlaybookId)
  if (error) return { error: error.message, items: [] as PlaybookItemWithPlaybook[] }
  return { error: null, items: (data ?? []) as unknown as PlaybookItemWithPlaybook[] }
}

/** Persist a new drag-drop order. orderedIds is the full list in the new sequence. */
export async function reorderPlaybookItems(playbookId: string, orderedIds: string[]) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const { error } = await q.reorderPlaybookItems(supabase, orderedIds)
  if (error) return { error: typeof error === 'string' ? error : (error as { message: string }).message }
  return { error: null }
}

/** Add an ad-hoc step or document directly to a live program (application_playbook_items). */
export async function addProgramItem(
  applicationId: string,
  item: {
    item_type: 'step' | 'document'
    name: string
    description?: string | null
    instructions?: string | null
    document_type?: string | null
    phase?: string | null
    assignment: 'client' | 'expert' | 'both'
    requirement_type: 'required' | 'optional'
  }
) {
  const { error: authError, session } = await requireStaff()
  if (authError || !session) return { error: authError ?? 'Forbidden', data: null }

  const supabase = await createClient()

  const [{ data: maxRow }, { data: appRow }] = await Promise.all([
    supabase
      .from('application_playbook_items')
      .select('item_order')
      .eq('application_id', applicationId)
      .order('item_order', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('applications')
      .select('agency_id')
      .eq('id', applicationId)
      .maybeSingle(),
  ])

  const nextOrder = (maxRow?.item_order ?? 0) + 1

  const { data, error } = await supabase
    .from('application_playbook_items')
    .insert({
      application_id: applicationId,
      item_order: nextOrder,
      item_type: item.item_type,
      name: item.name.trim(),
      description: item.description ?? null,
      instructions: item.instructions ?? null,
      document_type: item.document_type ?? null,
      phase: item.phase ?? null,
      assignment: item.assignment,
      requirement_type: item.requirement_type,
      status: 'not_started',
      updated_by: session.user.id,
    })
    .select()
    .single()

  if (error) return { error: error.message, data: null }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: appRow?.agency_id ?? null,
    table_name: 'application_playbook_items',
    record_id: (data as { id: string } | null)?.id ?? applicationId,
    action: 'CREATE',
    performed_by_user_id: session.user.id,
    details: { application_id: applicationId, item_type: item.item_type, name: item.name.trim() },
  })
  if (auditErr) console.error('[playbooks/addProgramItem] Audit log failed. applicationId=%s err=%s', applicationId, auditErr.message)

  revalidatePath(`/pages/admin/programs/${applicationId}`)
  revalidatePath(`/pages/expert/programs/${applicationId}`)
  revalidatePath(`/pages/agency/programs/${applicationId}`)

  return { error: null, data }
}

// ─── Application-level Program actions ───────────────────────────────────────

import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'

/**
 * Auto-migrate existing application_steps + application_documents into application_playbook_items.
 * Idempotent — safe to call if rows already exist (returns early with count of existing rows).
 * Called on first load of the Requirements tab for any application.
 */
export async function migrateApplicationToProgram(applicationId: string): Promise<{ error: string | null; count: number }> {
  const supabase = await createClient()

  // Fetch existing program items to know what's already been migrated.
  // If this SELECT fails (e.g. missing column, RLS), bail out — never proceed
  // blindly with an empty set or we risk re-inserting every item on every load.
  const { data: existingItems, error: fetchError } = await q.getApplicationPlaybookItems(supabase, applicationId)
  if (fetchError) return { error: fetchError.message, count: 0 }
  const existing = existingItems ?? []

  const alreadyMigratedStepIds = new Set(existing.map(i => i.source_application_step_id).filter(Boolean))
  const alreadyMigratedLrdIds  = new Set(existing.map(i => i.source_license_requirement_document_id).filter(Boolean))
  const existingStepCount = existing.filter(i => i.item_type === 'step').length
  const maxOrder = existing.length > 0 ? Math.max(...existing.map(i => i.item_order)) : 0

  // Resolve the application details (license type for LRD lookup, agency_id for note migration)
  const { data: app } = await supabase
    .from('applications')
    .select('license_type_id, state, agency_id')
    .eq('id', applicationId)
    .single()

  // Fetch old steps + license requirement documents in parallel
  const [stepsRes, lrdRes] = await Promise.all([
    supabase
      .from('application_steps')
      .select('id, step_name, step_order, description, instructions, phase, is_expert_step, is_completed, completed_at, completed_by, notes')
      .eq('application_id', applicationId)
      .order('step_order', { ascending: true }),
    app?.license_type_id && app?.state
      ? supabase
          .from('license_types')
          .select('name')
          .eq('id', app.license_type_id)
          .single()
          .then(async ({ data: lt }) => {
            if (!lt) return { data: [] }
            const { data: lr } = await supabase
              .from('license_requirements')
              .select('id')
              .eq('license_type', lt.name)
              .eq('state', app.state)
              .maybeSingle()
            if (!lr) return { data: [] }
            return supabase
              .from('license_requirement_documents')
              .select('id, document_name, document_type, description, is_required')
              .eq('license_requirement_id', lr.id)
              .order('id', { ascending: true })
          })
      : Promise.resolve({ data: [] }),
  ])

  // If step items already exist (by count), never add more steps regardless of source ID tracking.
  // This prevents duplication when source IDs are missing due to earlier schema gaps.
  const steps = existingStepCount > 0
    ? []
    : (stepsRes.data ?? []).filter(s => !alreadyMigratedStepIds.has(s.id))
  const lrds  = ((lrdRes as { data: { id: string; document_name: string; document_type: string | null; description: string | null; is_required: boolean }[] | null }).data ?? [])
    .filter(d => !alreadyMigratedLrdIds.has(d.id))

  if (steps.length === 0 && lrds.length === 0) return { error: null, count: existing.length }

  // For each license_requirement_document, find the best status from any uploaded application_document
  const lrdIds = lrds.map(d => d.id)
  const uploadedByLrd: Record<string, string> = {}
  if (lrdIds.length > 0) {
    const { data: appDocs } = await supabase
      .from('application_documents')
      .select('license_requirement_document_id, status')
      .eq('application_id', applicationId)
      .in('license_requirement_document_id', lrdIds)
    const docStatusMap: Record<string, ApplicationPlaybookItem['status']> = {
      approved: 'approved', pending: 'review_needed', draft: 'not_started', rejected: 'not_started',
    }
    for (const ad of appDocs ?? []) {
      if (ad.license_requirement_document_id) {
        uploadedByLrd[ad.license_requirement_document_id] = docStatusMap[ad.status as string] ?? 'not_started'
      }
    }
  }

  const now = new Date().toISOString()
  let order = maxOrder + 1
  const items: Omit<ApplicationPlaybookItem, 'id' | 'created_at' | 'updated_at'>[] = []

  for (const s of steps) {
    const isApproved = s.is_completed === true
    items.push({
      application_id: applicationId,
      playbook_item_id: null,
      item_order: order++,
      item_type: 'step',
      name: s.step_name,
      description: s.description ?? null,
      instructions: s.instructions ?? null,
      document_type: null,
      phase: s.phase ?? null,
      assignment: s.is_expert_step ? 'expert' : 'client',
      requirement_type: 'required',
      status: isApproved ? 'approved' : 'not_started',
      due_date: null,
      notes: s.notes ?? null,
      updated_by: null,
      approved_at: isApproved ? (s.completed_at ?? now) : null,
      approved_by: isApproved ? (s.completed_by ?? null) : null,
      source_application_step_id: s.id,
      source_application_document_id: null,
      source_license_requirement_document_id: null,
    })
  }

  for (const d of lrds) {
    const mappedStatus = (uploadedByLrd[d.id] as ApplicationPlaybookItem['status']) ?? 'not_started'
    const isApproved = mappedStatus === 'approved'
    items.push({
      application_id: applicationId,
      playbook_item_id: null,
      item_order: order++,
      item_type: 'document',
      name: d.document_name,
      description: d.description ?? null,
      instructions: null,
      document_type: d.document_type ?? null,
      phase: null,
      assignment: 'client',
      requirement_type: d.is_required ? 'required' : 'optional',
      status: mappedStatus,
      due_date: null,
      notes: null,
      updated_by: null,
      approved_at: isApproved ? now : null,
      approved_by: null,
      source_application_step_id: null,
      source_application_document_id: null,
      source_license_requirement_document_id: d.id,
    })
  }

  const { error } = await q.bulkInsertApplicationPlaybookItems(supabase, items)
  if (error) return { error: (error as { message: string }).message, count: 0 }

  // Migrate step notes: for each new step item whose source step had a notes value,
  // create an internal_note record so it's visible in the Notes tab.
  const stepsWithNotes = steps.filter(s => s.notes?.trim())
  if (stepsWithNotes.length > 0 && app?.agency_id) {
    const { data: freshItems } = await q.getApplicationPlaybookItems(supabase, applicationId)
    const itemByStepId = Object.fromEntries(
      (freshItems ?? [])
        .filter(i => i.source_application_step_id)
        .map(i => [i.source_application_step_id!, i])
    )
    const session = await getSession()
    const authorId = session?.user?.id ?? null

    const noteInserts = stepsWithNotes
      .map(s => {
        const pi = itemByStepId[s.id]
        if (!pi || !authorId) return null
        return {
          agency_id: app.agency_id,
          subject_type: 'application_playbook_item',
          subject_id: pi.id,
          content: s.notes!.trim(),
          created_by: authorId,
        }
      })
      .filter(Boolean)

    if (noteInserts.length > 0) {
      await supabase.from('internal_notes').insert(noteInserts)
    }
  }

  revalidatePath('/pages/admin/programs')
  revalidatePath('/pages/expert/programs')
  return { error: null, count: existing.length + items.length }
}

/** Fetch all program items for an application. No auth guard — agency can view their own. */
export async function getApplicationProgramItems(applicationId: string): Promise<{ error: string | null; items: ApplicationPlaybookItem[] }> {
  const supabase = await createClient()
  const { data, error } = await q.getApplicationPlaybookItems(supabase, applicationId)
  if (error) return { error: error.message, items: [] }
  return { error: null, items: (data ?? []) as ApplicationPlaybookItem[] }
}

export async function getProgramItemNoteCounts(itemIds: string[]): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase
    .from('internal_notes')
    .select('subject_id')
    .eq('subject_type', 'application_playbook_item')
    .in('subject_id', itemIds)
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.subject_id] = (counts[row.subject_id] ?? 0) + 1
  }
  return counts
}

/**
 * Apply a playbook template to an application (for applications with no existing steps/docs).
 * Finds the playbook for the application's license type + state, copies items into application_playbook_items.
 */
export async function applyPlaybookToApplication(applicationId: string): Promise<{ error: string | null; count: number }> {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr ?? 'Forbidden', count: 0 }

  const supabase = await createClient()

  // Guard: already has items
  const { count: existing } = await q.getApplicationPlaybookItemCount(supabase, applicationId)
  if (existing && existing > 0) return { error: 'Already applied', count: existing }

  // Find the playbook — either via direct playbook_id (standalone) or via license_type + state
  const { data: app } = await supabase
    .from('applications')
    .select('id, license_type_id, state, playbook_id')
    .eq('id', applicationId)
    .single()

  let resolvedPlaybookId: string | null = null

  if (app?.playbook_id) {
    // Standalone playbook: client selected it directly
    resolvedPlaybookId = app.playbook_id
  } else {
    // License-requirement-linked playbook: resolve via license_type + state
    if (!app?.license_type_id || !app?.state) return { error: 'Application has no license type or state', count: 0 }

    const { data: lr } = await supabase
      .from('license_requirements')
      .select('id')
      .eq('license_type_id', app.license_type_id)
      .eq('state', app.state)
      .maybeSingle()

    if (!lr) return { error: 'No license requirement found for this application', count: 0 }

    const { data: playbook } = await q.getPlaybookByRequirementId(supabase, lr.id)
    if (!playbook) return { error: 'No playbook has been built for this license requirement yet', count: 0 }
    resolvedPlaybookId = playbook.id
  }

  // Copy category/subcategory from the resolved playbook to the application
  const { data: resolvedPlaybook } = await supabase
    .from('playbooks')
    .select('category_id, subcategory_id')
    .eq('id', resolvedPlaybookId!)
    .maybeSingle()
  if (resolvedPlaybook?.category_id) {
    await supabase.from('applications').update({
      category_id: resolvedPlaybook.category_id,
      subcategory_id: resolvedPlaybook.subcategory_id ?? null,
    }).eq('id', applicationId)
  }

  const { data: playbookItems } = await q.getPlaybookItems(supabase, resolvedPlaybookId!)
  if (!playbookItems || playbookItems.length === 0) return { error: 'The playbook has no items', count: 0 }

  const now = new Date().toISOString()
  const items: Omit<ApplicationPlaybookItem, 'id' | 'created_at' | 'updated_at'>[] = playbookItems.map(pi => ({
    application_id: applicationId,
    playbook_item_id: pi.id,
    item_order: pi.item_order,
    item_type: pi.item_type,
    name: pi.name,
    description: pi.description,
    instructions: pi.instructions,
    document_type: pi.document_type,
    phase: pi.phase,
    assignment: pi.assignment,
    requirement_type: pi.requirement_type,
    status: 'not_started',
    due_date: null,
    notes: null,
    updated_by: null,
    approved_at: null,
    approved_by: null,
    source_application_step_id: null,
    source_application_document_id: null,
    source_license_requirement_document_id: null,
  }))

  const { error: insertErr } = await q.bulkInsertApplicationPlaybookItems(supabase, items)
  if (insertErr) return { error: (insertErr as { message: string }).message, count: 0 }

  // Copy validation rules for document items
  const docItems = (playbookItems as import('@/lib/supabase/query/playbooks').PlaybookItem[]).filter(pi => pi.item_type === 'document')
  if (docItems.length > 0) {
    // Get the newly inserted items to get their IDs
    const { data: newItems } = await q.getApplicationPlaybookItems(supabase, applicationId)
    const newItemsByPlaybookItemId = Object.fromEntries(
      (newItems ?? []).filter(i => i.playbook_item_id).map(i => [i.playbook_item_id, i])
    )

    for (const docItem of docItems) {
      const { data: rules } = await q.getPlaybookItemValidationRules(supabase, docItem.id)
      if (!rules || rules.length === 0) continue
      const newItem = newItemsByPlaybookItemId[docItem.id]
      if (!newItem) continue

      const checks = rules.map((r: import('@/lib/supabase/query/playbooks').PlaybookItemValidationRule) => ({
        application_playbook_item_id: newItem.id,
        validation_rule_id: r.validation_rule_id,
        rule_name: '', // will be filled below
        field_key: '',
        description: null as string | null,
        rule_order: r.rule_order,
        is_required: r.is_required,
        is_checked: false,
        checked_by: null as string | null,
        checked_at: null as string | null,
        notes: null as string | null,
        updated_at: now,
      }))

      // Get rule details
      const ruleIds = rules.map((r: import('@/lib/supabase/query/playbooks').PlaybookItemValidationRule) => r.validation_rule_id)
      const { data: ruleDetails } = await supabase
        .from('validation_rules')
        .select('id, name, field_key, description')
        .in('id', ruleIds)

      const ruleMap = Object.fromEntries((ruleDetails ?? []).map(rd => [rd.id, rd]))
      for (const check of checks) {
        const rd = ruleMap[check.validation_rule_id ?? '']
        if (rd) {
          check.rule_name = rd.name
          check.field_key = rd.field_key
          check.description = rd.description ?? null
        }
      }

      await supabase.from('application_playbook_item_rule_checks').insert(checks)
    }
  }

  revalidatePath('/pages/admin/licenses/applications')
  revalidatePath('/pages/expert/applications')
  return { error: null, count: items.length }
}

/** Update status, due date, or notes on a program item (staff only). */
export async function updateProgramItem(
  itemId: string,
  payload: { status?: ApplicationPlaybookItem['status']; due_date?: string | null; notes?: string | null }
): Promise<{ error: string | null; applicationStatus?: string }> {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const update: Record<string, unknown> = { ...payload, updated_by: session.user.id }

  if (payload.status === 'approved') {
    update.approved_at = new Date().toISOString()
    update.approved_by = session.user.id
  } else if (payload.status) {
    update.approved_at = null
    update.approved_by = null
  }

  const supabase = await createClient()
  const { error } = await q.updateApplicationPlaybookItemRow(supabase, itemId, update as Parameters<typeof q.updateApplicationPlaybookItemRow>[2])
  if (error) return { error: error.message }

  // ── Auto-transition application to under_review when all items complete ──────
  if (payload.status === 'approved') {
    const { data: itemRow } = await supabase
      .from('application_playbook_items')
      .select('application_id')
      .eq('id', itemId)
      .single()

    if (itemRow?.application_id) {
      const appId = itemRow.application_id
      const [{ count: incomplete }, { count: total }] = await Promise.all([
        supabase
          .from('application_playbook_items')
          .select('id', { count: 'exact', head: true })
          .eq('application_id', appId)
          .in('status', ['not_started', 'in_progress', 'review_needed']),
        supabase
          .from('application_playbook_items')
          .select('id', { count: 'exact', head: true })
          .eq('application_id', appId),
      ])

      if (incomplete === 0 && (total ?? 0) > 0) {
        const { data: app } = await supabase
          .from('applications')
          .select('status')
          .eq('id', appId)
          .single()

        if (app?.status === 'in_progress' || app?.status === 'approved') {
          const adminSupabase = await createAdminClient()
          await adminSupabase
            .from('applications')
            .update({ status: 'under_review', last_updated_date: new Date().toISOString() })
            .eq('id', appId)

          revalidatePath(`/pages/admin/programs/${appId}`)
          revalidatePath(`/pages/expert/programs/${appId}`)
          revalidatePath(`/pages/agency/programs/${appId}`)
          return { error: null, applicationStatus: 'under_review' }
        }
      }
    }
  }

  return { error: null }
}

/** Toggle a validation rule check (staff only). */
export async function toggleProgramRuleCheck(
  ruleCheckId: string,
  isChecked: boolean,
  notes?: string | null
): Promise<{ error: string | null }> {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = await createClient()
  const { error } = await q.updateApplicationRuleCheck(supabase, ruleCheckId, {
    is_checked: isChecked,
    checked_by: isChecked ? session.user.id : null,
    checked_at: isChecked ? new Date().toISOString() : null,
    notes: notes ?? null,
  })
  if (error) return { error: error.message }
  return { error: null }
}

/** Get validation rule checks for a program document item. No auth guard. */
export async function getProgramItemRuleChecks(applicationPlaybookItemId: string) {
  const supabase = await createClient()
  const { data, error } = await q.getRuleChecksForApplicationItem(supabase, applicationPlaybookItemId)
  if (error) return { error: error.message, checks: [] as import('@/lib/supabase/query/playbooks').ApplicationRuleCheck[] }
  return { error: null, checks: (data ?? []) as import('@/lib/supabase/query/playbooks').ApplicationRuleCheck[] }
}

/** Get documents uploaded for a specific program requirement item. No auth guard. */
export async function getProgramItemDocuments(applicationPlaybookItemId: string) {
  const supabase = await createClient()
  const { data, error } = await q.getDocumentsByPlaybookItem(supabase, applicationPlaybookItemId)
  if (error) return { error: error.message, documents: [] as { id: string; document_name: string; document_url: string; document_type: string | null; status: string | null; description: string | null; expert_review_notes: string | null; created_at: string }[] }
  return { error: null, documents: data ?? [] }
}

/** Get agency field values needed for document validation display. No auth guard. */
export async function getAgencyFieldValues(agencyId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agencies')
    .select('legal_entity_name, name, dba_name, licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip, physical_street_address, physical_city, physical_state, physical_zip_code, mailing_street_address, mailing_city, mailing_state, mailing_zip_code')
    .eq('id', agencyId)
    .single()
  if (error) return { error: error.message, agency: null }
  return { error: null, agency: data }
}

// ─── Application rule check management ───────────────────────────────────────

type AgencyFields = {
  legal_entity_name: string | null
  name: string | null
  dba_name: string | null
  licensed_office_street: string | null
  licensed_office_city: string | null
  licensed_office_state: string | null
  licensed_office_zip: string | null
  physical_street_address: string | null
  physical_city: string | null
  physical_state: string | null
  physical_zip_code: string | null
  mailing_street_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip_code: string | null
}

function joinAddress(...parts: (string | null | undefined)[]): string | null {
  const joined = parts.filter(Boolean).join(', ')
  return joined || null
}

function getExpectedValue(fieldKey: string, agency: AgencyFields): string | null {
  switch (fieldKey) {
    case 'legal_entity_name': return agency.legal_entity_name
    case 'agency_name':
    case 'dba_name':
    case 'operating_name': return agency.dba_name ?? agency.name
    case 'state':
    case 'operating_state': return agency.licensed_office_state
    case 'office_address':
    case 'office_street':
    case 'office_city':
    case 'office_state':
    case 'office_zip': {
      if (fieldKey === 'office_street') return agency.licensed_office_street
      if (fieldKey === 'office_city')   return agency.licensed_office_city
      if (fieldKey === 'office_state')  return agency.licensed_office_state
      if (fieldKey === 'office_zip')    return agency.licensed_office_zip
      return joinAddress(agency.licensed_office_street, agency.licensed_office_city, agency.licensed_office_state, agency.licensed_office_zip)
    }
    case 'corporate_address':
      return joinAddress(agency.physical_street_address, agency.physical_city, agency.physical_state, agency.physical_zip_code)
    case 'mailing_address':
      return joinAddress(agency.mailing_street_address, agency.mailing_city, agency.mailing_state, agency.mailing_zip_code)
    default: return null
  }
}

function matchInText(expected: string, text: string): { found: boolean; snippet: string | null } {
  const norm = text.toLowerCase().replace(/\s+/g, ' ')
  const exp = expected.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!exp) return { found: false, snippet: null }
  const idx = norm.indexOf(exp)
  if (idx === -1) return { found: false, snippet: null }
  const start = Math.max(0, idx - 50)
  const end = Math.min(text.length, idx + exp.length + 50)
  return { found: true, snippet: '…' + text.slice(start, end).trim() + '…' }
}

/** Add a validation rule check to a specific application program item (staff only). */
export async function addApplicationItemRule(itemId: string, validationRuleId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, check: null }

  const supabase = await createClient()

  const { data: rule, error: ruleErr } = await supabase
    .from('validation_rules')
    .select('id, name, field_key, description')
    .eq('id', validationRuleId)
    .single()
  if (ruleErr || !rule) return { error: ruleErr?.message ?? 'Rule not found', check: null }

  const { data: existing } = await q.getRuleChecksForApplicationItem(supabase, itemId)
  const maxOrder = existing && existing.length > 0
    ? Math.max(...existing.map((r: import('@/lib/supabase/query/playbooks').ApplicationRuleCheck) => r.rule_order))
    : 0

  const { data, error } = await q.insertApplicationRuleCheck(supabase, {
    application_playbook_item_id: itemId,
    validation_rule_id: validationRuleId,
    rule_name: rule.name,
    field_key: rule.field_key,
    description: rule.description ?? null,
    rule_order: maxOrder + 1,
    is_required: true,
  })
  if (error) return { error: error.message, check: null }
  return { error: null, check: data as import('@/lib/supabase/query/playbooks').ApplicationRuleCheck }
}

/** Remove a validation rule check from an application program item (staff only). */
export async function removeApplicationItemRule(ruleCheckId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const { error } = await q.deleteApplicationRuleCheck(supabase, ruleCheckId)
  if (error) return { error: error.message }
  return { error: null }
}

export type DraftValidationResult = {
  ruleCheckId: string
  ruleName: string
  fieldKey: string
  expectedValue: string
  autoResult: 'found' | 'not_found' | 'extraction_failed'
  matchSnippet: string | null
  foundText: string | null
  suggestedChecked: boolean
}

/**
 * Extract text from all documents on an item and run all validation rules simultaneously.
 * Returns draft results for expert review — nothing is saved until saveValidationRun is called.
 */
export async function runDocumentValidation(itemId: string, agencyId: string | null): Promise<{
  error: string | null
  extractionStatus: 'success' | 'partial' | 'failed' | 'no_document'
  draftResults: DraftValidationResult[]
}> {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, extractionStatus: 'failed', draftResults: [] }

  const supabase = await createClient()

  const [checksRes, agencyRes, docsRes] = await Promise.all([
    q.getRuleChecksForApplicationItem(supabase, itemId),
    agencyId
      ? supabase
          .from('agencies')
          .select('legal_entity_name, name, dba_name, licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip, physical_street_address, physical_city, physical_state, physical_zip_code, mailing_street_address, mailing_city, mailing_state, mailing_zip_code')
          .eq('id', agencyId)
          .single()
      : Promise.resolve({ data: null }),
    q.getDocumentsByPlaybookItem(supabase, itemId),
  ])

  const checks = (checksRes.data ?? []) as import('@/lib/supabase/query/playbooks').ApplicationRuleCheck[]
  const agency = agencyRes.data as AgencyFields | null
  const documents = docsRes.data ?? []

  let extractedText = ''
  let successCount = 0
  let failCount = 0

  if (documents.length > 0) {
    const { createSignedStorageUrl, STORAGE_BUCKET } = await import('@/lib/supabase/storage')

    for (const doc of documents) {
      const docUrl = (doc as { document_url: string }).document_url
      if (!docUrl) { failCount++; continue }

      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, docUrl, 600)
      if (!signedUrl) { failCount++; continue }

      const ext = (doc as { document_name: string }).document_name.split('.').pop()?.toLowerCase()

      try {
        const response = await fetch(signedUrl)
        if (!response.ok) { failCount++; continue }
        const buffer = Buffer.from(await response.arrayBuffer())

        if (ext === 'docx') {
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ buffer })
          extractedText += '\n' + result.value
          successCount++
        } else if (ext === 'pdf') {
          // pdf-parse v2 uses a class-based API: new PDFParse({ data }).getText()
          const { PDFParse } = await import('pdf-parse') as any
          const parser = new PDFParse({ data: new Uint8Array(buffer) })
          const result = await parser.getText()
          extractedText += '\n' + result.text
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }
  }

  const extractionStatus: 'success' | 'partial' | 'failed' | 'no_document' =
    documents.length === 0 ? 'no_document'
    : successCount === 0 ? 'failed'
    : failCount > 0 ? 'partial'
    : 'success'

  const canMatch = extractedText.length > 0

  // Always build draft results for all rules so the expert can review manually
  const draftResults: DraftValidationResult[] = checks.map(check => {
    const expectedValue = agency ? (getExpectedValue(check.field_key, agency) ?? '') : ''

    if (!canMatch || !expectedValue) {
      return {
        ruleCheckId: check.id,
        ruleName: check.rule_name,
        fieldKey: check.field_key,
        expectedValue: expectedValue || '(no value on file)',
        autoResult: 'extraction_failed' as const,
        matchSnippet: null,
        foundText: null,
        suggestedChecked: false,
      }
    }

    const { found, snippet } = matchInText(expectedValue, extractedText)
    return {
      ruleCheckId: check.id,
      ruleName: check.rule_name,
      fieldKey: check.field_key,
      expectedValue,
      autoResult: found ? 'found' as const : 'not_found' as const,
      matchSnippet: snippet,
      foundText: found ? expectedValue : null,
      suggestedChecked: found,
    }
  })

  return { error: null, extractionStatus, draftResults }
}

/** Save a completed validation run after expert review (staff only). */
export async function saveValidationRun(
  itemId: string,
  runNumber: number,
  confirmedResults: Array<{
    ruleCheckId: string
    isChecked: boolean
    notes: string | null
    autoResult: string
    matchSnippet: string | null
    foundText: string | null
    ruleName: string
    fieldKey: string
    expectedValue: string
  }>,
  extractionStatus: string
): Promise<{ error: string | null }> {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = await createClient()
  const now = new Date().toISOString()

  if (runNumber > 1) {
    const { error: resetErr } = await q.resetApplicationRuleChecks(supabase, itemId)
    if (resetErr) return { error: (resetErr as { message: string }).message }
  }

  const updates = confirmedResults.map(r => ({
    id: r.ruleCheckId,
    is_checked: r.isChecked,
    checked_by: session.user.id,
    checked_at: now,
    notes: r.notes,
  }))

  const { error: updateErr } = await q.bulkUpdateApplicationRuleChecks(supabase, updates)
  if (updateErr) return { error: (updateErr as { message: string }).message }

  const results = confirmedResults.map(r => ({
    rule_name: r.ruleName,
    field_key: r.fieldKey,
    expected_value: r.expectedValue,
    auto_result: r.autoResult,
    match_snippet: r.matchSnippet,
    found_text: r.foundText ?? null,
    is_checked: r.isChecked,
    notes: r.notes,
  }))

  const passedCount      = confirmedResults.filter(r => r.isChecked).length
  const failedCount      = confirmedResults.filter(r => !r.isChecked).length
  const needsReviewCount = 0

  const { error: insertErr } = await q.insertValidationRun(supabase, {
    application_playbook_item_id: itemId,
    run_number: runNumber,
    extraction_status: extractionStatus,
    completed_by: session.user.id,
    passed_count: passedCount,
    failed_count: failedCount,
    needs_review_count: needsReviewCount,
    results,
  })
  if (insertErr) return { error: (insertErr as { message: string }).message }

  return { error: null }
}

/** Fetch all completed validation runs for an item, newest first (staff only). */
export async function getValidationHistory(itemId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, runs: [] as import('@/lib/supabase/query/playbooks').ValidationRun[] }

  const supabase = await createClient()
  const { data, error } = await q.getValidationRunsForItem(supabase, itemId)
  if (error) return { error: error.message, runs: [] as import('@/lib/supabase/query/playbooks').ValidationRun[] }
  return { error: null, runs: (data ?? []) as unknown as import('@/lib/supabase/query/playbooks').ValidationRun[] }
}

/** Fetch the latest validation run summary for an item (staff + agency members). */
export async function getLatestValidationSummary(itemId: string): Promise<{ passed: number; failed: number } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('validation_runs')
    .select('passed_count, failed_count')
    .eq('application_playbook_item_id', itemId)
    .order('run_number', { ascending: false })
    .limit(1)
    .single()
  if (!data) return null
  return { passed: data.passed_count, failed: data.failed_count }
}

// ─── Document delete / item workflow ─────────────────────────────────────────

/** Delete an uploaded document (file + DB row). Accessible to staff and agency members. */
export async function deleteApplicationDocument(documentId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('application_documents')
    .select('id, document_url, application_id')
    .eq('id', documentId)
    .single()
  if (!doc) return { error: 'Document not found' }

  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') {
    const { data: app } = await supabase
      .from('applications')
      .select('agency_id')
      .eq('id', doc.application_id)
      .single()
    if (!app) return { error: 'Access denied' }

    const { data: membership } = await supabase
      .from('agency_admins')
      .select('user_id')
      .eq('agency_id', app.agency_id)
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (!membership) return { error: 'Access denied' }
  }

  if (doc.document_url) {
    await removeFiles(supabase, STORAGE_BUCKET.APPLICATION, [doc.document_url])
  }

  const { error } = await supabase.from('application_documents').delete().eq('id', documentId)
  if (error) return { error: error.message }
  return { error: null }
}

/**
 * Client submits a program item for review.
 * Transitions: not_started | review_needed → in_progress
 * For document items: at least one document must be uploaded first.
 */
export async function submitProgramItem(itemId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const supabase = await createClient()

  const { data: item } = await supabase
    .from('application_playbook_items')
    .select('id, application_id, item_type, status, name')
    .eq('id', itemId)
    .single()
  if (!item) return { error: 'Item not found' }

  if (item.status !== 'not_started' && item.status !== 'review_needed') {
    return { error: 'Item cannot be submitted in its current status' }
  }

  if (item.item_type === 'document') {
    const { count } = await supabase
      .from('application_documents')
      .select('id', { count: 'exact', head: true })
      .eq('application_playbook_item_id', itemId)
    if (!count || count === 0) return { error: 'Upload a document first' }
  }

  const { error: updateErr } = await supabase
    .from('application_playbook_items')
    .update({ status: 'in_progress', updated_by: session.user.id, updated_at: new Date().toISOString() })
    .eq('id', itemId)
  if (updateErr) return { error: updateErr.message }

  const { data: app } = await supabase
    .from('applications')
    .select('assigned_expert_id, application_name')
    .eq('id', item.application_id)
    .single()

  if (app?.assigned_expert_id) {
    const adminSupabase = createAdminClient()
    await adminSupabase.from('notifications').insert({
      user_id: app.assigned_expert_id,
      title: 'Item Submitted for Review',
      message: `"${item.name}" in "${app.application_name}" has been submitted and is ready for your review.`,
      type: 'application_update',
      icon_type: 'document',
    })
  }

  revalidatePath('/pages/agency/programs')
  revalidatePath('/pages/admin/programs')
  revalidatePath('/pages/expert/programs')
  revalidatePath(`/pages/agency/programs/${item.application_id}`)
  revalidatePath(`/pages/admin/programs/${item.application_id}`)
  revalidatePath(`/pages/expert/programs/${item.application_id}`)
  return { error: null }
}

/**
 * Staff sends a program item back to the client with feedback.
 * Transitions: in_progress → review_needed
 */
export async function sendBackProgramItem(itemId: string, notes: string): Promise<{ error: string | null }> {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = await createClient()

  const { data: item } = await supabase
    .from('application_playbook_items')
    .select('id, application_id, name, status')
    .eq('id', itemId)
    .single()
  if (!item) return { error: 'Item not found' }
  if (item.status !== 'in_progress') return { error: 'Item must be in progress to send back' }

  const { error: updateErr } = await supabase
    .from('application_playbook_items')
    .update({ status: 'review_needed', notes, updated_by: session.user.id, updated_at: new Date().toISOString() })
    .eq('id', itemId)
  if (updateErr) return { error: updateErr.message }

  const { data: app } = await supabase
    .from('applications')
    .select('company_owner_id, agency_id, application_name')
    .eq('id', item.application_id)
    .single()

  if (app) {
    const adminSupabase = createAdminClient()
    const notifPayload = {
      title: 'Action Required on Program Item',
      message: `"${item.name}" in "${app.application_name}" needs your attention: ${notes}`,
      type: 'application_update',
      icon_type: 'warning',
    }

    if (app.company_owner_id) {
      await adminSupabase.from('notifications').insert({ ...notifPayload, user_id: app.company_owner_id })
    } else if (app.agency_id) {
      const { data: admins } = await adminSupabase
        .from('agency_admins')
        .select('user_id')
        .eq('agency_id', app.agency_id)
        .not('user_id', 'is', null)
      for (const admin of admins ?? []) {
        await adminSupabase.from('notifications').insert({ ...notifPayload, user_id: admin.user_id })
      }
    }
  }

  revalidatePath('/pages/admin/programs')
  revalidatePath('/pages/expert/programs')
  revalidatePath('/pages/agency/programs')
  revalidatePath(`/pages/admin/programs/${item.application_id}`)
  revalidatePath(`/pages/expert/programs/${item.application_id}`)
  revalidatePath(`/pages/agency/programs/${item.application_id}`)
  return { error: null }
}

// ── Playbook Library ──────────────────────────────────────────────────────────

type PlaybookMetadata = {
  name: string
  playbook_type: 'license_requirement' | 'package' | 'onboarding' | 'compliance'
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
  category_id?: string | null
  subcategory_id?: string | null
}

export async function createPlaybook(
  data: PlaybookMetadata
): Promise<{ error: string | null; data: { id: string } | null }> {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden', data: null }

  const supabase = await createClient()
  const { data: row, error } = await q.insertPlaybookRecord(supabase, {
    ...data,
    is_active: true,
    created_by: session.user.id,
  })
  if (error) return { error: error.message, data: null }

  revalidatePath('/pages/admin/playbooks')
  return { error: null, data: { id: row!.id } }
}

export async function updatePlaybook(
  playbookId: string,
  data: Partial<PlaybookMetadata> & { is_active?: boolean }
): Promise<{ error: string | null }> {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden' }

  const supabase = await createClient()
  const { error } = await q.updatePlaybookRecord(supabase, playbookId, data)
  if (error) return { error: error.message }

  revalidatePath('/pages/admin/playbooks')
  revalidatePath(`/pages/admin/playbooks/${playbookId}`)
  return { error: null }
}

// ── Playbook Template Actions ────────────────────────────────────────────────

export async function createPlaybookTemplate(data: {
  playbookId: string
  templateName: string
  description: string
  fileUrl: string
  fileName: string
}): Promise<{ error: string | null; data: { id: string } | null }> {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, data: null }

  const supabase = await createClient()
  const { data: row, error } = await q.insertPlaybookTemplate(supabase, {
    playbook_id: data.playbookId,
    template_name: data.templateName,
    description: data.description || null,
    file_url: data.fileUrl,
    file_name: data.fileName,
  })

  if (error) return { error: error.message, data: null }
  revalidatePath(`/pages/admin/playbooks/${data.playbookId}`)
  return { error: null, data: { id: (row as { id: string }).id } }
}

export async function updatePlaybookTemplateAction(
  id: string,
  data: { templateName: string; description: string }
): Promise<{ error: string | null }> {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const { error } = await q.updatePlaybookTemplateById(supabase, id, {
    template_name: data.templateName,
    description: data.description || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/pages/admin/playbooks')
  return { error: null }
}

export async function deletePlaybookTemplateAction(id: string): Promise<{ error: string | null }> {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const { error } = await q.deletePlaybookTemplateById(supabase, id)
  if (error) return { error: error.message }
  revalidatePath('/pages/admin/playbooks')
  return { error: null }
}
