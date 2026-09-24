'use server'

import { readApplicationNoteCounts } from '@/lib/repositories/internal-note-reads'
import { createInternalNote } from '@/lib/repositories/internal-note-writes'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import sql, { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import type { PlaybookItem, ValidationRule } from '@/lib/supabase/query/playbooks'
import { removeFiles } from '@/lib/storage/client'
import { STORAGE_BUCKET } from '@/lib/storage'

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

  const { data: existing } = await q.getPlaybookByRequirementId(licenseRequirementId)
  if (existing) return { error: null, playbook: existing }

  const [lr] = await sql<{ state: string; license_type: string }[]>`
    SELECT state, license_type FROM license_requirements WHERE id = ${licenseRequirementId} LIMIT 1
  `

  const name = lr ? `${lr.state} – ${lr.license_type}` : 'Playbook'

  // Pre-populate all display fields from the matching license type
  let ltFields: Partial<Parameters<typeof q.insertPlaybook>[0]> = {}
  if (lr?.license_type) {
    const [lt] = await sql<{ description: string | null; cost_min: number | null; cost_max: number | null; cost_display: string | null; service_fee: number | null; service_fee_display: string | null; processing_time_min: number | null; processing_time_max: number | null; processing_time_display: string | null; renewal_period_years: number | null; renewal_period_display: string | null; icon_type: string | null; requirements: string[] | null }[]>`
      SELECT description, cost_min, cost_max, cost_display, service_fee, service_fee_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements
      FROM license_types WHERE name = ${lr.license_type} LIMIT 1
    `
    if (lt) ltFields = lt
  }

  const { data, error } = await q.insertPlaybook({
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

  const { data, error } = await q.getPlaybookItems(playbookId)
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

  // Guard: don't double-import
  const { data: existing } = await q.getPlaybookItems(playbookId)
  if (existing && existing.length > 0) return { error: 'Playbook already has items' }

  const [steps, docs] = await Promise.all([
    sql<{ id: string; step_name: string; step_order: number; description: string | null; instructions: string | null; estimated_days: number | null; is_required: boolean; is_expert_step: boolean; phase: string | null }[]>`
      SELECT id, step_name, step_order, description, instructions, estimated_days, is_required, is_expert_step, phase
      FROM license_requirement_steps
      WHERE license_requirement_id = ${licenseRequirementId}
      ORDER BY step_order ASC
    `,
    sql<{ id: string; document_name: string; document_type: string | null; description: string | null; is_required: boolean }[]>`
      SELECT id, document_name, document_type, description, is_required
      FROM license_requirement_documents
      WHERE license_requirement_id = ${licenseRequirementId}
    `,
  ])

  if (steps.length === 0 && docs.length === 0) return { error: 'No steps or documents to import' }

  let order = 1
  const items: Parameters<typeof q.bulkInsertPlaybookItems>[0] = []

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

  const { error } = await q.bulkInsertPlaybookItems(items)
  if (error) return { error: error.message }

  // ── General Info + Templates are best-effort — don't fail the whole import ─
  try {
    const [lrRows, lrTemplates] = await Promise.all([
      sql<{ state: string; license_type: string }[]>`
        SELECT state, license_type FROM license_requirements WHERE id = ${licenseRequirementId} LIMIT 1
      `,
      sql<{ template_name: string; description: string | null; file_url: string; file_name: string }[]>`
        SELECT template_name, description, file_url, file_name
        FROM license_requirement_templates
        WHERE license_requirement_id = ${licenseRequirementId}
      `,
    ])

    const lr2 = lrRows[0]
    if (lr2) {
      const [lt] = await sql<{ description: string | null; cost_min: number | null; cost_max: number | null; cost_display: string | null; service_fee: number | null; service_fee_display: string | null; processing_time_min: number | null; processing_time_max: number | null; processing_time_display: string | null; renewal_period_years: number | null; renewal_period_display: string | null; icon_type: string | null; requirements: string[] | null }[]>`
        SELECT description, cost_min, cost_max, cost_display, service_fee, service_fee_display, processing_time_min, processing_time_max, processing_time_display, renewal_period_years, renewal_period_display, icon_type, requirements
        FROM license_types WHERE name = ${lr2.license_type} LIMIT 1
      `

      if (lt) {
        await q.updatePlaybookRecord(playbookId, {
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

    if (lrTemplates.length > 0) {
      await sql`INSERT INTO playbook_templates ${sql(lrTemplates.map(t => ({
        playbook_id: playbookId,
        template_name: t.template_name,
        description: t.description ?? null,
        file_url: t.file_url,
        file_name: t.file_name,
      })))}`
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

  // Get max order
  const { data: existing } = await q.getPlaybookItems(playbookId)
  const maxOrder = existing && existing.length > 0
    ? Math.max(...existing.map((i: PlaybookItem) => i.item_order))
    : 0

  const { data, error } = await q.insertPlaybookItem({
    playbook_id: playbookId,
    item_order: maxOrder + 1,
    ...payload,
  })

  if (error) return { error: error.message, item: null }

  const { error: auditErr } = await q.insertAuditLog({
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

  const { error } = await q.updatePlaybookItem(itemId, payload)
  if (error) return { error: error.message }

  const { error: auditErr } = await q.insertAuditLog({
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

  const { error } = await q.deletePlaybookItem(itemId)
  if (error) return { error: error.message }

  const { error: auditErr } = await q.insertAuditLog({
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
  const { data, error } = await q.getValidationRuleLibrary()
  if (error) return { error: error.message, rules: [] }
  return { error: null, rules: (data ?? []) as ValidationRule[] }
}

/** Get current validation rule selections for a playbook item. */
export async function getPlaybookItemRules(playbookItemId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, ruleIds: [] as string[] }

  const { data, error } = await q.getPlaybookItemValidationRules(playbookItemId)
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

  const rules = selectedRuleIds.map((validation_rule_id, idx) => ({
    validation_rule_id,
    rule_order: idx + 1,
    is_required: true,
  }))
  const { error } = await q.setPlaybookItemValidationRules(playbookItemId, rules)
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

  // 1. Fetch source items
  type SourceItem = { id: string; item_type: string; name: string; description: string | null; instructions: string | null; estimated_days: number | null; document_type: string | null; phase: string | null; assignment: string; requirement_type: string }
  const sourceItems = await sql<SourceItem[]>`
    SELECT id, item_type, name, description, instructions, estimated_days, document_type, phase, assignment, requirement_type
    FROM playbook_items
    WHERE id = ANY(${sourceItemIds}::uuid[])
    ORDER BY item_order ASC
  `

  if (sourceItems.length === 0) return { error: 'No items found', items: [] }

  // 2. Fetch validation rules for source items
  type SourceRule = { playbook_item_id: string; validation_rule_id: string; rule_order: number; is_required: boolean }
  const sourceRules = await sql<SourceRule[]>`
    SELECT playbook_item_id, validation_rule_id, rule_order, is_required
    FROM playbook_item_validation_rules
    WHERE playbook_item_id = ANY(${sourceItemIds}::uuid[])
  `

  const rulesByItem: Record<string, Array<{ validation_rule_id: string; rule_order: number; is_required: boolean }>> = {}
  for (const rule of sourceRules) {
    if (!rulesByItem[rule.playbook_item_id]) rulesByItem[rule.playbook_item_id] = []
    rulesByItem[rule.playbook_item_id].push({
      validation_rule_id: rule.validation_rule_id,
      rule_order: rule.rule_order,
      is_required: rule.is_required,
    })
  }

  // 3. Get max item_order for target playbook
  const { data: existing } = await q.getPlaybookItems(targetPlaybookId)
  const maxOrder = existing && existing.length > 0
    ? Math.max(...(existing as PlaybookItem[]).map(i => i.item_order))
    : 0

  // 4. Insert new items and get back their IDs
  const now = new Date().toISOString()
  const insertPayloads = sourceItems.map((item, idx) => ({
    playbook_id: targetPlaybookId,
    item_order: maxOrder + idx + 1,
    item_type: item.item_type,
    name: item.name,
    description: item.description ?? null,
    instructions: item.instructions ?? null,
    estimated_days: item.estimated_days ?? null,
    document_type: item.document_type ?? null,
    phase: item.phase ?? null,
    assignment: item.assignment,
    requirement_type: item.requirement_type,
    source_step_id: null as string | null,
    source_document_id: null as string | null,
    updated_at: now,
  }))

  const insertedItems = await sql<PlaybookItem[]>`
    INSERT INTO playbook_items ${sql(insertPayloads)}
    RETURNING id, playbook_id, item_order, item_type, name, description, instructions, estimated_days, document_type, phase, assignment, requirement_type, source_step_id, source_document_id, created_at, updated_at
  `

  if (insertedItems.length === 0) return { error: 'Insert failed', items: [] }

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
    await sql`INSERT INTO playbook_item_validation_rules ${sql(ruleInserts)}`
  }

  revalidatePath('/pages/admin/playbooks')
  revalidatePath('/pages/admin/license-requirements')

  return { error: null, items: insertedItems }
}

/** Fetch all active playbooks except the current one (for Copy tab dropdown). */
export async function getOtherPlaybooksForCopy(currentPlaybookId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, playbooks: [] as OtherPlaybook[] }

  const { data, error } = await q.getOtherPlaybooks(currentPlaybookId)
  if (error) return { error: error.message, playbooks: [] as OtherPlaybook[] }
  return { error: null, playbooks: (data ?? []) as unknown as OtherPlaybook[] }
}

/** Fetch all playbook items from all other playbooks with playbook metadata (for Browse tab). */
export async function getAllItemsForBrowse(excludePlaybookId: string) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr, items: [] as PlaybookItemWithPlaybook[] }

  const { data, error } = await q.getAllPlaybookItemsWithPlaybookInfo(excludePlaybookId)
  if (error) return { error: error.message, items: [] as PlaybookItemWithPlaybook[] }
  return { error: null, items: (data ?? []) as unknown as PlaybookItemWithPlaybook[] }
}

/** Persist a new drag-drop order. orderedIds is the full list in the new sequence. */
export async function reorderPlaybookItems(playbookId: string, orderedIds: string[]) {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr }

  const { error } = await q.reorderPlaybookItems(orderedIds)
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

  const [[maxRow], [appRow]] = await Promise.all([
    sql<{ item_order: number | null }[]>`
      SELECT item_order FROM application_playbook_items WHERE application_id = ${applicationId} ORDER BY item_order DESC LIMIT 1
    `,
    sql<{ agency_id: string | null }[]>`
      SELECT agency_id FROM applications WHERE id = ${applicationId} LIMIT 1
    `,
  ])

  const nextOrder = (maxRow?.item_order ?? 0) + 1

  const [data] = await sql<Record<string, unknown>[]>`
    INSERT INTO application_playbook_items (
      application_id, item_order, item_type, name, description, instructions,
      document_type, phase, assignment, requirement_type, status, updated_by
    ) VALUES (
      ${applicationId}, ${nextOrder}, ${item.item_type}, ${item.name.trim()},
      ${item.description ?? null}, ${item.instructions ?? null},
      ${item.document_type ?? null}, ${item.phase ?? null},
      ${item.assignment}, ${item.requirement_type}, 'not_started', ${session.user.id}
    )
    RETURNING *
  `

  if (!data) return { error: 'Insert failed', data: null }

  const { error: auditErr } = await q.insertAuditLog({
    agency_id: appRow?.agency_id ?? null,
    table_name: 'application_playbook_items',
    record_id: (data.id as string) ?? applicationId,
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
  const session=await getSession()
  if(!session) return {error:'Not authenticated',count:0}
  try{
    return await withUserContext(session.user.id,'',null,async()=>{
      const [actor]=await sql<{id:string;role:string}[]>`SELECT id,role FROM user_profiles
        WHERE id=${session.user.id}::uuid AND is_active=true AND role IN ('admin','expert')`
      if(!actor) return {error:'Forbidden',count:0}
      await sql`SELECT set_config('app.current_user_role',${actor.role},true)`
      return migrateApplicationToProgramTransaction(applicationId,actor.id)
    })
  }catch{return {error:'Unable to migrate application program',count:0}}
}

async function migrateApplicationToProgramTransaction(applicationId:string,actorId:string): Promise<{ error: string | null; count: number }> {
  // Fetch existing program items to know what's already been migrated.
  // If this SELECT fails (e.g. missing column, RLS), bail out — never proceed
  // blindly with an empty set or we risk re-inserting every item on every load.
  const { data: existingItems, error: fetchError } = await q.getApplicationPlaybookItems(applicationId)
  if (fetchError) return { error: fetchError.message, count: 0 }
  const existing = existingItems ?? []

  const alreadyMigratedStepIds = new Set(existing.map(i => i.source_application_step_id).filter(Boolean))
  const alreadyMigratedLrdIds  = new Set(existing.map(i => i.source_license_requirement_document_id).filter(Boolean))
  const existingStepCount = existing.filter(i => i.item_type === 'step').length
  const maxOrder = existing.length > 0 ? Math.max(...existing.map(i => i.item_order)) : 0

  // Resolve the application details (license type for LRD lookup, agency_id for note migration)
  const [app] = await sql<{ license_type_id: string | null; state: string | null; agency_id: string | null }[]>`
    SELECT license_type_id, state, agency_id FROM applications WHERE id = ${applicationId} LIMIT 1
  `
  if(!app?.agency_id) return {error:'Application not found or has no agency',count:0}
  await sql`SELECT set_config('app.current_agency_id',${app.agency_id},true)`

  type StepRow = { id: string; step_name: string; step_order: number; description: string | null; instructions: string | null; phase: string | null; is_expert_step: boolean; is_completed: boolean | null; completed_at: string | null; completed_by: string | null; notes: string | null }
  type LrdRow = { id: string; document_name: string; document_type: string | null; description: string | null; is_required: boolean }

  // Fetch old steps + license requirement documents in parallel
  const [allSteps, allLrds] = await Promise.all([
    sql<StepRow[]>`
      SELECT id, step_name, step_order, description, instructions, phase, is_expert_step, is_completed, completed_at, completed_by, notes
      FROM application_steps
      WHERE application_id = ${applicationId}
      ORDER BY step_order ASC
    `,
    (async (): Promise<LrdRow[]> => {
      if (!app?.license_type_id || !app?.state) return []
      const [lt] = await sql<{ name: string }[]>`SELECT name FROM license_types WHERE id = ${app.license_type_id} LIMIT 1`
      if (!lt) return []
      const [lr] = await sql<{ id: string }[]>`SELECT id FROM license_requirements WHERE license_type = ${lt.name} AND state = ${app.state} LIMIT 1`
      if (!lr) return []
      return sql<LrdRow[]>`
        SELECT id, document_name, document_type, description, is_required
        FROM license_requirement_documents
        WHERE license_requirement_id = ${lr.id}
        ORDER BY id ASC
      `
    })(),
  ])

  // If step items already exist (by count), never add more steps regardless of source ID tracking.
  // This prevents duplication when source IDs are missing due to earlier schema gaps.
  const steps = existingStepCount > 0
    ? []
    : allSteps.filter(s => !alreadyMigratedStepIds.has(s.id))
  const lrds = allLrds.filter(d => !alreadyMigratedLrdIds.has(d.id))

  if (steps.length === 0 && lrds.length === 0) return { error: null, count: existing.length }

  // For each license_requirement_document, find the best status from any uploaded application_document
  const lrdIds = lrds.map(d => d.id)
  const uploadedByLrd: Record<string, string> = {}
  if (lrdIds.length > 0) {
    const appDocs = await sql<{ license_requirement_document_id: string | null; status: string }[]>`
      SELECT license_requirement_document_id, status
      FROM application_documents
      WHERE application_id = ${applicationId}
      AND license_requirement_document_id = ANY(${lrdIds}::uuid[])
    `
    const docStatusMap: Record<string, ApplicationPlaybookItem['status']> = {
      approved: 'approved', pending: 'review_needed', draft: 'not_started', rejected: 'not_started',
    }
    for (const ad of appDocs) {
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

  const { error } = await q.bulkInsertApplicationPlaybookItems(items)
  if (error) return { error: (error as { message: string }).message, count: 0 }

  // Migrate step notes: for each new step item whose source step had a notes value,
  // create an internal_note record so it's visible in the Notes tab.
  const stepsWithNotes = steps.filter(s => s.notes?.trim())
  if (stepsWithNotes.length > 0 && app?.agency_id) {
    const { data: freshItems } = await q.getApplicationPlaybookItems(applicationId)
    const itemByStepId = Object.fromEntries(
      (freshItems ?? [])
        .filter(i => i.source_application_step_id)
        .map(i => [i.source_application_step_id!, i])
    )
    for (const s of stepsWithNotes) {
      const pi = itemByStepId[s.id]
      if (!pi) continue
      const noteResult = await createInternalNote({
        agencyId: app.agency_id,
        subjectType: 'application_playbook_item',
        subjectId: pi.id,
        applicationId,
        content: s.notes!.trim(),
      })
      if (noteResult.error) throw new Error(noteResult.error)
    }
  }

  await sql`INSERT INTO audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
    VALUES (${app.agency_id}::uuid,'applications',${applicationId}::uuid,'MIGRATE_PROGRAM',${actorId}::uuid,
      ${JSON.stringify({step_count:steps.length,document_count:lrds.length,note_count:stepsWithNotes.length})}::jsonb)`

  revalidatePath('/pages/admin/programs')
  revalidatePath('/pages/expert/programs')
  return { error: null, count: existing.length + items.length }
}

/** Fetch all program items for an application. No auth guard — agency can view their own. */
export async function getApplicationProgramItems(applicationId: string): Promise<{ error: string | null; items: ApplicationPlaybookItem[] }> {
  const { data, error } = await q.getApplicationPlaybookItems(applicationId)
  if (error) return { error: error.message, items: [] }
  return { error: null, items: (data ?? []) as ApplicationPlaybookItem[] }
}

export async function getProgramItemNoteCounts(itemIds: string[]): Promise<Record<string, number>> {
  const result=await readApplicationNoteCounts({subjectIds:itemIds,subjectType:'application_playbook_item'})
  // Compatibility for legacy badge callers: denied/failed counts disclose no note metadata.
  return result.data ?? {}
}

/**
 * Apply a playbook template to an application (for applications with no existing steps/docs).
 * Finds the playbook for the application's license type + state, copies items into application_playbook_items.
 */
export async function applyPlaybookToApplication(applicationId: string): Promise<{ error: string | null; count: number }> {
  const { error: authErr } = await requireStaff()
  if (authErr) return { error: authErr ?? 'Forbidden', count: 0 }

  // Guard: already has items
  const { count: existing } = await q.getApplicationPlaybookItemCount(applicationId)
  if (existing && existing > 0) return { error: 'Already applied', count: existing }

  // Find the playbook — either via direct playbook_id (standalone) or via license_type + state
  const [app] = await sql<{ id: string; license_type_id: string | null; state: string | null; playbook_id: string | null }[]>`
    SELECT id, license_type_id, state, playbook_id FROM applications WHERE id = ${applicationId} LIMIT 1
  `

  let resolvedPlaybookId: string | null = null

  if (app?.playbook_id) {
    // Standalone playbook: client selected it directly
    resolvedPlaybookId = app.playbook_id
  } else {
    // License-requirement-linked playbook: resolve via license_type + state
    if (!app?.license_type_id || !app?.state) return { error: 'Application has no license type or state', count: 0 }

    const [lr] = await sql<{ id: string }[]>`
      SELECT id FROM license_requirements WHERE license_type_id = ${app.license_type_id} AND state = ${app.state} LIMIT 1
    `

    if (!lr) return { error: 'No license requirement found for this application', count: 0 }

    const { data: playbook } = await q.getPlaybookByRequirementId(lr.id)
    if (!playbook) return { error: 'No playbook has been built for this license requirement yet', count: 0 }
    resolvedPlaybookId = playbook.id
  }

  // Copy category/subcategory from the resolved playbook to the application
  const [resolvedPlaybook] = await sql<{ category_id: string | null; subcategory_id: string | null }[]>`
    SELECT category_id, subcategory_id FROM playbooks WHERE id = ${resolvedPlaybookId!} LIMIT 1
  `
  if (resolvedPlaybook?.category_id) {
    await sql`UPDATE applications SET category_id = ${resolvedPlaybook.category_id}, subcategory_id = ${resolvedPlaybook.subcategory_id ?? null} WHERE id = ${applicationId}`
  }

  const { data: playbookItems } = await q.getPlaybookItems(resolvedPlaybookId!)
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

  const { error: insertErr } = await q.bulkInsertApplicationPlaybookItems(items)
  if (insertErr) return { error: (insertErr as { message: string }).message, count: 0 }

  // Copy validation rules for document items
  const docItems = (playbookItems as import('@/lib/supabase/query/playbooks').PlaybookItem[]).filter(pi => pi.item_type === 'document')
  if (docItems.length > 0) {
    // Get the newly inserted items to get their IDs
    const { data: newItems } = await q.getApplicationPlaybookItems(applicationId)
    const newItemsByPlaybookItemId = Object.fromEntries(
      (newItems ?? []).filter(i => i.playbook_item_id).map(i => [i.playbook_item_id, i])
    )

    for (const docItem of docItems) {
      const { data: rules } = await q.getPlaybookItemValidationRules(docItem.id)
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
      const ruleDetails = await sql<{ id: string; name: string; field_key: string; description: string | null }[]>`
        SELECT id, name, field_key, description FROM validation_rules WHERE id = ANY(${ruleIds}::uuid[])
      `

      const ruleMap = Object.fromEntries(ruleDetails.map(rd => [rd.id, rd]))
      for (const check of checks) {
        const rd = ruleMap[check.validation_rule_id ?? '']
        if (rd) {
          check.rule_name = rd.name
          check.field_key = rd.field_key
          check.description = rd.description ?? null
        }
      }

      await sql`INSERT INTO application_playbook_item_rule_checks ${sql(checks)}`
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

  const { error } = await q.updateApplicationPlaybookItemRow(itemId, update as Parameters<typeof q.updateApplicationPlaybookItemRow>[1])
  if (error) return { error: error.message }

  // ── Auto-transition application to under_review when all items complete ──────
  if (payload.status === 'approved') {
    const [itemRow] = await sql<{ application_id: string | null }[]>`
      SELECT application_id FROM application_playbook_items WHERE id = ${itemId} LIMIT 1
    `

    if (itemRow?.application_id) {
      const appId = itemRow.application_id
      const [[incompleteRow], [totalRow]] = await Promise.all([
        sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM application_playbook_items WHERE application_id = ${appId} AND status = ANY(ARRAY['not_started','in_progress','review_needed'])`,
        sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM application_playbook_items WHERE application_id = ${appId}`,
      ])

      if ((incompleteRow?.count ?? 1) === 0 && (totalRow?.count ?? 0) > 0) {
        const [appRow] = await sql<{ status: string }[]>`SELECT status FROM applications WHERE id = ${appId} LIMIT 1`

        if (appRow?.status === 'in_progress' || appRow?.status === 'approved') {
          await sql`UPDATE applications SET status = 'under_review', last_updated_date = ${new Date().toISOString()} WHERE id = ${appId}`

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

  const { error } = await q.updateApplicationRuleCheck(ruleCheckId, {
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
  const { data, error } = await q.getRuleChecksForApplicationItem(applicationPlaybookItemId)
  if (error) return { error: error.message, checks: [] as import('@/lib/supabase/query/playbooks').ApplicationRuleCheck[] }
  return { error: null, checks: (data ?? []) as import('@/lib/supabase/query/playbooks').ApplicationRuleCheck[] }
}

/** Get documents uploaded for a specific program requirement item. No auth guard. */
export async function getProgramItemDocuments(applicationPlaybookItemId: string) {
  const { data, error } = await q.getDocumentsByPlaybookItem(applicationPlaybookItemId)
  if (error) return { error: error.message, documents: [] as { id: string; document_name: string; document_url: string; document_type: string | null; status: string | null; description: string | null; expert_review_notes: string | null; created_at: string }[] }
  return { error: null, documents: data ?? [] }
}

/** Get agency field values needed for document validation display. No auth guard. */
export async function getAgencyFieldValues(agencyId: string) {
  const [agency] = await sql<AgencyFields[]>`
    SELECT legal_entity_name, name, dba_name, licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip, physical_street_address, physical_city, physical_state, physical_zip_code, mailing_street_address, mailing_city, mailing_state, mailing_zip_code
    FROM agencies WHERE id = ${agencyId} LIMIT 1
  `
  if (!agency) return { error: 'Agency not found', agency: null }
  return { error: null, agency }
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

  const [rule] = await sql<{ id: string; name: string; field_key: string; description: string | null }[]>`
    SELECT id, name, field_key, description FROM validation_rules WHERE id = ${validationRuleId} LIMIT 1
  `
  if (!rule) return { error: 'Rule not found', check: null }

  const { data: existing } = await q.getRuleChecksForApplicationItem(itemId)
  const maxOrder = existing && existing.length > 0
    ? Math.max(...existing.map((r: import('@/lib/supabase/query/playbooks').ApplicationRuleCheck) => r.rule_order))
    : 0

  const { data, error } = await q.insertApplicationRuleCheck({
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

  const { error } = await q.deleteApplicationRuleCheck(ruleCheckId)
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

  const [checksRes, agencyRows, docsRes] = await Promise.all([
    q.getRuleChecksForApplicationItem(itemId),
    agencyId
      ? sql<AgencyFields[]>`SELECT legal_entity_name, name, dba_name, licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip, physical_street_address, physical_city, physical_state, physical_zip_code, mailing_street_address, mailing_city, mailing_state, mailing_zip_code FROM agencies WHERE id = ${agencyId} LIMIT 1`
      : Promise.resolve([] as AgencyFields[]),
    q.getDocumentsByPlaybookItem(itemId),
  ])

  const checks = (checksRes.data ?? []) as import('@/lib/supabase/query/playbooks').ApplicationRuleCheck[]
  const agency = agencyRows[0] ?? null
  const documents = docsRes.data ?? []

  let extractedText = ''
  let successCount = 0
  let failCount = 0

  if (documents.length > 0) {
    const { createSignedStorageUrl, STORAGE_BUCKET } = await import('@/lib/storage')

    for (const doc of documents) {
      const docUrl = (doc as { document_url: string }).document_url
      if (!docUrl) { failCount++; continue }

      const signedUrl = await createSignedStorageUrl(STORAGE_BUCKET.APPLICATION, docUrl, 600)
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

  const now = new Date().toISOString()

  if (runNumber > 1) {
    const { error: resetErr } = await q.resetApplicationRuleChecks(itemId)
    if (resetErr) return { error: (resetErr as { message: string }).message }
  }

  const updates = confirmedResults.map(r => ({
    id: r.ruleCheckId,
    is_checked: r.isChecked,
    checked_by: session.user.id,
    checked_at: now,
    notes: r.notes,
  }))

  const { error: updateErr } = await q.bulkUpdateApplicationRuleChecks(updates)
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

  const { error: insertErr } = await q.insertValidationRun({
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

  const { data, error } = await q.getValidationRunsForItem(itemId)
  if (error) return { error: error.message, runs: [] as import('@/lib/supabase/query/playbooks').ValidationRun[] }
  return { error: null, runs: (data ?? []) as unknown as import('@/lib/supabase/query/playbooks').ValidationRun[] }
}

/** Fetch the latest validation run summary for an item (staff + agency members). */
export async function getLatestValidationSummary(itemId: string): Promise<{ passed: number; failed: number } | null> {
  const [data] = await sql<{ passed_count: number; failed_count: number }[]>`
    SELECT passed_count, failed_count FROM validation_runs
    WHERE application_playbook_item_id = ${itemId}
    ORDER BY run_number DESC LIMIT 1
  `
  if (!data) return null
  return { passed: data.passed_count, failed: data.failed_count }
}

// ─── Document delete / item workflow ─────────────────────────────────────────

/** Delete an uploaded document (file + DB row). Accessible to staff and agency members. */
export async function deleteApplicationDocument(documentId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const [doc] = await sql<{ id: string; document_url: string | null; application_id: string }[]>`
    SELECT id, document_url, application_id FROM application_documents WHERE id = ${documentId} LIMIT 1
  `
  if (!doc) return { error: 'Document not found' }

  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') {
    const [app] = await sql<{ agency_id: string }[]>`SELECT agency_id FROM applications WHERE id = ${doc.application_id} LIMIT 1`
    if (!app) return { error: 'Access denied' }

    const [membership] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM agency_admins WHERE agency_id = ${app.agency_id} AND user_id = ${session.user.id} LIMIT 1
    `
    if (!membership) return { error: 'Access denied' }
  }

  if (doc.document_url) {
    await removeFiles(STORAGE_BUCKET.APPLICATION, [doc.document_url])
  }

  await sql`DELETE FROM application_documents WHERE id = ${documentId}`
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

  const [item] = await sql<{ id: string; application_id: string; item_type: string; status: string; name: string }[]>`
    SELECT id, application_id, item_type, status, name FROM application_playbook_items WHERE id = ${itemId} LIMIT 1
  `
  if (!item) return { error: 'Item not found' }

  if (item.status !== 'not_started' && item.status !== 'review_needed') {
    return { error: 'Item cannot be submitted in its current status' }
  }

  if (item.item_type === 'document') {
    const [countRow] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM application_documents WHERE application_playbook_item_id = ${itemId}
    `
    if (!countRow?.count || countRow.count === 0) return { error: 'Upload a document first' }
  }

  await sql`
    UPDATE application_playbook_items
    SET status = 'in_progress', updated_by = ${session.user.id}, updated_at = ${new Date().toISOString()}
    WHERE id = ${itemId}
  `

  const [app] = await sql<{ assigned_expert_id: string | null; application_name: string }[]>`
    SELECT assigned_expert_id, application_name FROM applications WHERE id = ${item.application_id} LIMIT 1
  `

  if (app?.assigned_expert_id) {
    await sql`
      INSERT INTO notifications (user_id, title, message, type, icon_type) VALUES (
        ${app.assigned_expert_id},
        ${'Item Submitted for Review'},
        ${`"${item.name}" in "${app.application_name}" has been submitted and is ready for your review.`},
        ${'application_update'},
        ${'document'}
      )
    `
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

  const [item] = await sql<{ id: string; application_id: string; name: string; status: string }[]>`
    SELECT id, application_id, name, status FROM application_playbook_items WHERE id = ${itemId} LIMIT 1
  `
  if (!item) return { error: 'Item not found' }
  if (item.status !== 'in_progress') return { error: 'Item must be in progress to send back' }

  await sql`
    UPDATE application_playbook_items
    SET status = 'review_needed', notes = ${notes}, updated_by = ${session.user.id}, updated_at = ${new Date().toISOString()}
    WHERE id = ${itemId}
  `

  const [app] = await sql<{ company_owner_id: string | null; agency_id: string | null; application_name: string }[]>`
    SELECT company_owner_id, agency_id, application_name FROM applications WHERE id = ${item.application_id} LIMIT 1
  `

  if (app) {
    const title = 'Action Required on Program Item'
    const message = `"${item.name}" in "${app.application_name}" needs your attention: ${notes}`
    const type = 'application_update'
    const icon_type = 'warning'

    if (app.company_owner_id) {
      await sql`INSERT INTO notifications (user_id, title, message, type, icon_type) VALUES (${app.company_owner_id}, ${title}, ${message}, ${type}, ${icon_type})`
    } else if (app.agency_id) {
      const admins = await sql<{ user_id: string }[]>`
        SELECT user_id FROM agency_admins WHERE agency_id = ${app.agency_id} AND user_id IS NOT NULL
      `
      for (const admin of admins) {
        await sql`INSERT INTO notifications (user_id, title, message, type, icon_type) VALUES (${admin.user_id}, ${title}, ${message}, ${type}, ${icon_type})`
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

  const { data: row, error } = await q.insertPlaybookRecord({
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

  const { error } = await q.updatePlaybookRecord(playbookId, data)
  if (error) return { error: error.message }

  revalidatePath('/pages/admin/playbooks')
  revalidatePath(`/pages/admin/playbooks/${playbookId}`)
  return { error: null }
}

// ── Playbook Template Actions ────────────────────────────────────────────────

export async function getPlaybookTemplatesAction(playbookId: string) {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session || session.profile?.role !== 'admin') {
    return { error: authErr ?? 'Forbidden', data: null }
  }
  const { data, error } = await q.getPlaybookTemplates(playbookId)
  return { data, error: error ? error.message : null }
}

export async function getExpertProgramTemplatesAction(applicationId: string, playbookId: string) {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }
  const [application] = await sql<{ assigned_expert_id: string | null; playbook_id: string | null }[]>`
    SELECT assigned_expert_id, playbook_id FROM public.applications
    WHERE id = ${applicationId}::uuid
    LIMIT 1
  `
  if (!application) return { error: 'Not found', data: null }
  if (session.profile.role === 'expert') {
    if (application.assigned_expert_id !== session.user.id || application.playbook_id !== playbookId) {
      return { error: 'Forbidden', data: null }
    }
  }
  const { data, error } = await q.getPlaybookTemplates(playbookId)
  if (error) return { error: error.message, data: null }
  await sql`
    INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
    VALUES (NULL, 'playbook_templates', ${playbookId}::uuid, 'READ', ${session.user.id}::uuid,
      ${JSON.stringify({ operation: 'read_expert_program_templates', application_id: applicationId })}::jsonb)
  `
  return { error: null, data }
}

export async function createPlaybookTemplate(data: {
  playbookId: string
  templateName: string
  description: string
  fileUrl: string
  fileName: string
}): Promise<{ error: string | null; data: { id: string } | null }> {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session || session.profile?.role !== 'admin') return { error: authErr ?? 'Forbidden', data: null }

  const { data: row, error } = await q.insertPlaybookTemplate({
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
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session || session.profile?.role !== 'admin') return { error: authErr ?? 'Forbidden' }

  const { error } = await q.updatePlaybookTemplateById(id, {
    template_name: data.templateName,
    description: data.description || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/pages/admin/playbooks')
  return { error: null }
}

export async function deletePlaybookTemplateAction(id: string): Promise<{ error: string | null }> {
  const { error: authErr, session } = await requireStaff()
  if (authErr || !session || session.profile?.role !== 'admin') return { error: authErr ?? 'Forbidden' }

  const { error } = await q.deletePlaybookTemplateById(id)
  if (error) return { error: error.message }
  revalidatePath('/pages/admin/playbooks')
  return { error: null }
}
