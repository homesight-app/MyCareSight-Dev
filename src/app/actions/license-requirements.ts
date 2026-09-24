'use server'

import { revalidatePath } from 'next/cache'
import * as q from '@/lib/supabase/query'

export interface CreateStepData {
  licenseRequirementId: string
  stepName: string
  description: string
  instructions: string
  estimatedDays?: number
  isRequired: boolean
}

export interface CreateDocumentData {
  licenseRequirementId: string
  documentName: string
  description: string
  isRequired: boolean
}

export interface CreateExpertStepData {
  licenseRequirementId: string
  phase: string
  stepTitle: string
  description: string
}

export async function createStep(data: CreateStepData) {

  const { data: existingSteps } = await q.getMaxStepOrderRegular(data.licenseRequirementId)
  const nextOrder = existingSteps && existingSteps.length > 0 ? existingSteps[0].step_order + 1 : 1

  const { data: step, error } = await q.insertStep({
    license_requirement_id: data.licenseRequirementId,
    step_name: data.stepName,
    step_order: nextOrder,
    description: data.description || null,
    instructions: data.instructions || null,
    is_expert_step: false,
    estimated_days: data.estimatedDays ?? null,
    is_required: data.isRequired,
  })

  if (error) {
    return { error: error.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: step }
}

export async function createDocument(data: CreateDocumentData) {

  const { data: document, error } = await q.insertDocument({
    license_requirement_id: data.licenseRequirementId,
    document_name: data.documentName,
    description: data.description || null,
    is_required: data.isRequired,
  })

  if (error) {
    return { error: error.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: document }
}

// Expert steps in License Requirements are a template only. They are copied to application_steps
// when an application is created; changes here do not affect existing applications.
export async function createExpertStep(data: CreateExpertStepData) {

  const { data: existingSteps } = await q.getMaxStepOrderExpert(data.licenseRequirementId)
  const nextOrder = existingSteps?.length ? existingSteps[0].step_order + 1 : 1

  const { data: step, error } = await q.insertStep({
    license_requirement_id: data.licenseRequirementId,
    step_name: data.stepTitle,
    step_order: nextOrder,
    description: data.description || null,
    instructions: null,
    is_expert_step: true,
    estimated_days: null,
    is_required: true,
    phase: data.phase || null,
  })

  if (error) {
    return { error: error.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: step }
}

// Update functions
export async function updateStep(id: string, data: { stepName: string; description: string; estimatedDays?: number; isRequired: boolean }) {

  const { data: step, error } = await q.updateStep(id, {
    step_name: data.stepName,
    description: data.description || null,
    estimated_days: data.estimatedDays ?? null,
    is_required: data.isRequired,
  })

  if (error) {
    return { error: error.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: step }
}

/** Reorder steps for a requirement. orderedStepIds = step ids in desired order (1-based step_order). Only non-expert steps. */
export async function reorderSteps(licenseRequirementId: string, orderedStepIds: string[]) {
  for (let i = 0; i < orderedStepIds.length; i++) {
    const { error } = await q.updateStepOrder(orderedStepIds[i], licenseRequirementId, i + 1)
    if (error) {
      return { error: error.message }
    }
  }
  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}

export async function updateDocument(id: string, data: { documentName: string; description: string; isRequired: boolean }) {

  const { data: document, error } = await q.updateDocument(id, {
    document_name: data.documentName,
    description: data.description || null,
    is_required: data.isRequired,
  })

  if (error) {
    return { error: error.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: document }
}

export async function updateExpertStep(id: string, data: { phase: string; stepTitle: string; description: string }) {

  const { data: step, error } = await q.updateExpertStepInApplication(id, {
    step_name: data.stepTitle,
    description: data.description ?? null,
    phase: data.phase || null,
  })

  if (error) {
    return { error: error.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: step }
}

// Update expert step template (license_requirement_steps). Does not touch application_steps.
export async function updateExpertStepTemplate(
  stepId: string,
  data: { phase: string; stepTitle: string; description: string }
) {

  const { data: step, error } = await q.updateExpertStepTemplate(stepId, {
    step_name: data.stepTitle,
    description: data.description ?? null,
    phase: data.phase || null,
  })

  if (error) return { error: error.message, data: null }
  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: step }
}

// Delete functions
export async function deleteStep(id: string) {

  const { error } = await q.deleteStepById(id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}

export async function deleteDocument(id: string) {

  const { error } = await q.deleteDocumentById(id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}

export async function deleteExpertStep(id: string) {

  const { error } = await q.deleteExpertStepInApplication(id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}

// Delete expert step template (license_requirement_steps). Does not touch application_steps.
export async function deleteExpertStepTemplate(stepId: string) {

  const { error } = await q.deleteExpertStepTemplateById(stepId)

  if (error) return { error: error.message }
  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}

export async function getLicenseRequirementId(state: string, licenseTypeName: string) {
  const result = await q.getOrCreateLicenseRequirement(state, licenseTypeName)
  if ('error' in result) return { error: result.error, data: null }
  return { error: null, data: result.id }
}

// Returns plain expert-step data for server-action callers so RSC serialization
// never receives Error objects.
export type ExpertStepTemplate = {
  step_name: string
  step_order: number
  description: string | null
  instructions: string | null
  phase: string | null
}

export async function getExpertStepTemplates(
  state: string,
  licenseTypeName: string
): Promise<{ steps: ExpertStepTemplate[] | null; error: string | null }> {
  try {
    const reqResult = await q.getOrCreateLicenseRequirement(state, licenseTypeName)
    if ('error' in reqResult) {
      return { steps: null, error: String(reqResult.error) }
    }
    const requirementId = reqResult.id

    const { data: templateSteps, error: fetchError } = await q.getExpertStepTemplatesByRequirementId(requirementId)

    if (fetchError) {
      return { steps: null, error: String(fetchError.message) }
    }
    if (!templateSteps?.length) {
      return { steps: [], error: null }
    }

    const steps: ExpertStepTemplate[] = templateSteps.map((step) => ({
      step_name: String(step.step_name),
      step_order: Number(step.step_order),
      description: step.description != null ? String(step.description) : null,
      instructions: step.instructions != null ? String(step.instructions) : null,
      phase: step.phase != null ? String(step.phase) : null,
    }))
    return { steps, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { steps: null, error: String(message) }
  }
}

// Copy expert step template from a license requirement into an application. Called when an application is created with a license type so the application gets its own snapshot; later changes to the requirement template do not affect this application. Idempotent: does nothing if the application already has expert steps.
// Never throws: returns { error } so RSC serialization never receives an Error object (avoids "frame.join is not a function").
export async function copyExpertStepsFromRequirementToApplication(
  applicationId: string,
  state: string,
  licenseTypeName: string
): Promise<{ error: string | null }> {
  try {

    const { data: existing } = await q.getExistingExpertStepsForApplication(applicationId)
    if (existing?.length) return { error: null }

    const reqResult = await q.getOrCreateLicenseRequirement(state, licenseTypeName)
    if ('error' in reqResult) return { error: String(reqResult.error) }
    const requirementId = reqResult.id

    const { data: templateSteps, error: fetchError } = await q.getExpertStepTemplatesByRequirementId(requirementId)

    if (fetchError) return { error: String(fetchError.message) }
    if (!templateSteps?.length) return { error: null }

    const rows = templateSteps.map((step) => ({
      application_id: applicationId,
      step_name: step.step_name,
      step_order: step.step_order,
      description: step.description ?? null,
      instructions: step.instructions ?? null,
      phase: step.phase ?? null,
      is_expert_step: true,
      is_completed: false,
    }))

    const { error: insertError } = await q.insertApplicationExpertSteps(rows)
    if (insertError) return { error: String(insertError.message) }
    return { error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { error: String(message) }
  }
}

// Get all license requirements for copying
export async function getAllLicenseRequirements() {

  const { data: requirements, error } = await q.getAllLicenseRequirements()

  if (error) {
    return { error: error.message, data: null }
  }

  return { error: null, data: requirements || [] }
}

// Get steps from a license requirement
export async function getStepsFromRequirement(requirementId: string) {

  const { data: steps, error } = await q.getStepsFromRequirement(requirementId)

  if (error) {
    return { error: error.message, data: null }
  }

  return { error: null, data: steps || [] }
}

// Step with state and license_type for Browse All Steps
export type StepWithRequirementInfo = {
  id: string
  step_name: string
  step_order: number
  description: string | null
  estimated_days?: number | null
  is_required?: boolean
  license_requirement_id: string
  state: string
  license_type: string
}

// Get all steps across all license requirements with state and license_type (for Browse All Steps modal).
// Optionally exclude steps belonging to currentRequirementId so the current license's steps are not listed.
export async function getAllStepsWithRequirementInfo(currentRequirementId?: string | null): Promise<{ error: string | null; data: StepWithRequirementInfo[] | null }> {

  const { data: rows, error } = await q.getAllStepsWithRequirementInfo(currentRequirementId)

  if (error) {
    return { error: error.message, data: null }
  }

  const steps: StepWithRequirementInfo[] = (rows || []).map((row: Record<string, unknown>) => {
    const req = row.license_requirements as { state?: string; license_type?: string } | null
    return {
      id: row.id as string,
      step_name: row.step_name as string,
      step_order: row.step_order as number,
      description: (row.description as string | null) ?? null,
      estimated_days: (row.estimated_days as number | null) ?? null,
      is_required: (row.is_required as boolean) ?? true,
      license_requirement_id: row.license_requirement_id as string,
      state: req?.state ?? '',
      license_type: req?.license_type ?? '',
    }
  })

  return { error: null, data: steps }
}

// Document with state and license_type for Browse All Documents
export type DocumentWithRequirementInfo = {
  id: string
  document_name: string
  document_type: string | null
  description: string | null
  is_required: boolean
  license_requirement_id: string
  state: string
  license_type: string
}

export async function getAllDocumentsWithRequirementInfo(currentRequirementId?: string | null): Promise<{ error: string | null; data: DocumentWithRequirementInfo[] | null }> {

  const { data: rows, error } = await q.getAllDocumentsWithRequirementInfo(currentRequirementId)

  if (error) {
    return { error: error.message, data: null }
  }

  const documents: DocumentWithRequirementInfo[] = (rows || []).map((row: Record<string, unknown>) => {
    const req = row.license_requirements as { state?: string; license_type?: string } | null
    return {
      id: row.id as string,
      document_name: row.document_name as string,
      document_type: (row.document_type as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      is_required: (row.is_required as boolean) ?? true,
      license_requirement_id: row.license_requirement_id as string,
      state: req?.state ?? '',
      license_type: req?.license_type ?? '',
    }
  })

  return { error: null, data: documents }
}

// Get documents from a license requirement
export async function getDocumentsFromRequirement(requirementId: string) {

  const { data: documents, error } = await q.getDocumentsFromRequirement(requirementId)

  if (error) {
    return { error: error.message, data: null }
  }

  return { error: null, data: documents || [] }
}

// Get templates from a license requirement
export async function getTemplatesFromRequirement(requirementId: string) {

  const { data: templates, error } = await q.getTemplatesFromRequirement(requirementId)

  if (error) {
    return { error: error.message, data: null }
  }

  return { error: null, data: templates || [] }
}

export async function createTemplate(data: { licenseRequirementId: string; templateName: string; description: string; fileUrl: string; fileName: string }) {

  const { data: template, error } = await q.insertTemplate({
    license_requirement_id: data.licenseRequirementId,
    template_name: data.templateName,
    description: data.description || null,
    file_url: data.fileUrl,
    file_name: data.fileName,
  })

  if (error) {
    return { error: error.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: template }
}

export async function updateTemplate(id: string, data: { templateName: string; description: string }) {

  const { data: template, error } = await q.updateTemplate(id, {
    template_name: data.templateName,
    description: data.description || null,
  })

  if (error) {
    return { error: error.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: template }
}

export async function deleteTemplate(id: string) {

  const { error } = await q.deleteTemplateById(id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}

// Copy steps from one requirement to another
export async function copySteps(targetRequirementId: string, sourceStepIds: string[]) {

  if (sourceStepIds.length === 0) {
    return { error: 'No steps selected', data: null }
  }

  const { data: sourceSteps, error: fetchError } = await q.getLicenseRequirementStepsByIds(sourceStepIds)

  if (fetchError || !sourceSteps || sourceSteps.length === 0) {
    return { error: fetchError?.message || 'Failed to fetch source steps', data: null }
  }

  type StepRow = { step_name: string; description: string | null; step_order?: number; estimated_days?: number | null; is_required?: boolean; is_expert_step?: boolean; phase?: string | null }
  const stepsToInsert = (sourceSteps as StepRow[]).map((step) => ({
    license_requirement_id: targetRequirementId,
    step_name: step.step_name,
    step_order: 0,
    description: step.description,
    estimated_days: step.estimated_days ?? null,
    is_required: step.is_required ?? true,
    is_expert_step: step.is_expert_step ?? false,
    phase: step.phase ?? null,
  }))

  const { data: existingExpert } = await q.getMaxStepOrderExpertForRequirement(targetRequirementId)
  const { data: existingRequired } = await q.getMaxStepOrderRegularForRequirement(targetRequirementId)
  let nextExpertOrder = existingExpert?.length ? existingExpert[0].step_order + 1 : 1
  let nextRequiredOrder = existingRequired?.length ? existingRequired[0].step_order + 1 : 1
  stepsToInsert.forEach((s: { is_expert_step?: boolean; step_order: number }) => {
    s.step_order = s.is_expert_step ? nextExpertOrder++ : nextRequiredOrder++
  })

  const { data: copiedSteps, error: insertError } = await q.insertLicenseRequirementSteps(stepsToInsert)

  if (insertError) {
    return { error: insertError.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: copiedSteps }
}

// Copy documents from one requirement to another
export async function copyDocuments(targetRequirementId: string, sourceDocumentIds: string[]) {

  if (sourceDocumentIds.length === 0) {
    return { error: 'No documents selected', data: null }
  }

  const { data: sourceDocuments, error: fetchError } = await q.getLicenseRequirementDocumentsByIds(sourceDocumentIds)

  if (fetchError || !sourceDocuments || sourceDocuments.length === 0) {
    return { error: fetchError?.message || 'Failed to fetch source documents', data: null }
  }

  type DocRow = { document_name: string; document_type: string | null; description: string | null; is_required: boolean }
  const documentsToInsert = (sourceDocuments as DocRow[]).map((doc) => ({
    license_requirement_id: targetRequirementId,
    document_name: doc.document_name,
    document_type: doc.document_type,
    description: doc.description,
    is_required: doc.is_required,
  }))

  const { data: copiedDocuments, error: insertError } = await q.insertLicenseRequirementDocuments(documentsToInsert)

  if (insertError) {
    return { error: insertError.message, data: null }
  }

  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: copiedDocuments }
}

// Get expert step templates for a license requirement (from license_requirement_steps). These are the template only; they are copied to applications at creation and are not synced to existing applications.
export async function getExpertStepsFromRequirement(requirementId: string) {

  const { data: rows, error } = await q.getExpertStepsFromRequirement(requirementId)

  if (error) return { error: error.message, data: null }
  return { error: null, data: rows || [] }
}

// Expert step with state and license_type for Browse All Expert Steps
export type ExpertStepWithRequirementInfo = {
  id: string
  step_name: string
  step_order: number
  description: string | null
  phase?: string | null
  license_requirement_id: string
  state: string
  license_type: string
}

export async function getAllExpertStepsWithRequirementInfo(currentRequirementId?: string | null): Promise<{ error: string | null; data: ExpertStepWithRequirementInfo[] | null }> {

  const { data: rows, error } = await q.getApplicationStepsExpertWithAppId()

  if (error) {
    return { error: error.message, data: null }
  }

  if (!rows?.length) return { error: null, data: [] }

  const appIds = Array.from(new Set((rows as unknown as { application_id: string }[]).map((r) => r.application_id)))
  const { data: apps } = await q.getApplicationsByIds(appIds)
  const appMap = new Map<string, { state: string; license_type_id: string | null }>()
  for (const a of apps || []) {
    appMap.set((a as { id: string }).id, {
      state: (a as { state: string }).state,
      license_type_id: (a as { license_type_id: string | null }).license_type_id ?? null,
    })
  }
  const ltIds = Array.from(new Set(Array.from(appMap.values()).map((a) => a.license_type_id).filter(Boolean) as string[]))
  const { data: lts } = await q.getLicenseTypesByIds(ltIds)
  const ltMap = new Map<string, string>()
  for (const lt of lts || []) {
    ltMap.set((lt as { id: string }).id, (lt as { name: string }).name)
  }
  const reqIdByStateType = new Map<string, string>()
  const steps: ExpertStepWithRequirementInfo[] = []
  const seen = new Set<string>()

  for (const row of rows as unknown as { id: string; step_name: string; step_order: number; description: string | null; phase: string | null; application_id: string }[]) {
    const app = appMap.get(row.application_id)
    if (!app?.license_type_id) continue
    const state = app.state
    const licenseTypeName = ltMap.get(app.license_type_id) ?? ''
    if (!licenseTypeName) continue
    const key = `${row.step_name}\n${row.description ?? ''}\n${row.phase ?? ''}\n${state}\n${licenseTypeName}`
    if (seen.has(key)) continue
    seen.add(key)
    let licenseRequirementId = reqIdByStateType.get(`${state}\n${licenseTypeName}`)
    if (licenseRequirementId == null) {
      const { data: lr } = await q.getLicenseRequirementByStateAndTypeSingle(state, licenseTypeName)
      licenseRequirementId = (lr as { id: string } | null)?.id ?? ''
      if (licenseRequirementId) reqIdByStateType.set(`${state}\n${licenseTypeName}`, licenseRequirementId)
    }
    if (currentRequirementId && licenseRequirementId === currentRequirementId) continue
    steps.push({
      id: row.id,
      step_name: row.step_name,
      step_order: row.step_order,
      description: row.description ?? null,
      phase: row.phase ?? null,
      license_requirement_id: licenseRequirementId,
      state,
      license_type: licenseTypeName,
    })
  }

  return { error: null, data: steps }
}

// Copy expert steps into the target requirement's template (license_requirement_steps). Source IDs may be from license_requirement_steps (Copy from requirement) or application_steps (Browse). Does not touch existing applications.
export async function copyExpertSteps(targetRequirementId: string, sourceExpertStepIds: string[]) {

  if (sourceExpertStepIds.length === 0) {
    return { error: 'No expert steps selected', data: null }
  }

  const { data: fromTemplate, error: tErr } = await q.getExpertStepTemplatesFromRequirementByIds(sourceExpertStepIds)
  const { data: fromApps, error: aErr } = await q.getApplicationStepsExpertByIds(sourceExpertStepIds)

  const sourceSteps = (fromTemplate || []).length > 0 ? fromTemplate : fromApps
  const fetchError = (fromTemplate || []).length > 0 ? tErr : aErr

  if (fetchError || !sourceSteps || sourceSteps.length === 0) {
    return { error: fetchError?.message || 'Failed to fetch source expert steps', data: null }
  }

  const seen = new Set<string>()
  const stepsToInsert = (sourceSteps as { step_name: string; description: string | null; phase: string | null }[]).filter((s) => {
    const key = `${s.step_name}\n${s.description ?? ''}\n${s.phase ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const { data: existingSteps } = await q.getMaxStepOrderExpertForRequirement(targetRequirementId)

  let nextOrder = existingSteps?.length ? existingSteps[0].step_order + 1 : 1

  const rows = stepsToInsert.map((step) => ({
    license_requirement_id: targetRequirementId,
    step_name: step.step_name,
    step_order: nextOrder++,
    description: step.description ?? null,
    phase: step.phase ?? null,
    is_expert_step: true,
  }))

  const { data: inserted, error: insertError } = await q.insertLicenseRequirementSteps(rows)

  if (insertError) return { error: insertError.message, data: null }
  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: inserted }
}

// Copy selected expert step templates from a license requirement into an application (for expert "Copy from Another License").
export async function copySelectedExpertStepsFromRequirementToApplication(
  applicationId: string,
  requirementId: string,
  stepIds: string[]
): Promise<{ error: string | null }> {
  if (!stepIds.length) return { error: 'No steps selected' }
  const { data: steps, error: fetchErr } = await q.getExpertStepsFromRequirementForCopy(requirementId, stepIds)
  if (fetchErr) return { error: fetchErr.message }
  if (!steps?.length) return { error: 'No expert steps found' }
  const { data: existing } = await q.getMaxApplicationExpertStepOrder(applicationId)
  let nextOrder = existing?.length ? existing[0].step_order + 1 : 1
  const rows = steps.map((s) => ({
    application_id: applicationId,
    step_name: s.step_name,
    step_order: nextOrder++,
    description: s.description ?? null,
    phase: s.phase ?? null,
    is_expert_step: true,
    is_completed: false,
  }))
  const { error: insertErr } = await q.insertApplicationSteps(rows)
  if (insertErr) return { error: insertErr.message }
  return { error: null }
}

// Copy selected expert steps (from application_steps) into another application (for expert "Browse All Steps").
export async function copyExpertStepsFromApplicationStepsToApplication(
  applicationId: string,
  sourceApplicationStepIds: string[]
): Promise<{ error: string | null }> {
  if (!sourceApplicationStepIds.length) return { error: 'No steps selected' }
  const { data: steps, error: fetchErr } = await q.getExpertStepsFromApplicationSteps(sourceApplicationStepIds)
  if (fetchErr) return { error: fetchErr.message }
  if (!steps?.length) return { error: 'No expert steps found' }
  const { data: existing } = await q.getMaxApplicationExpertStepOrder(applicationId)
  let nextOrder = existing?.length ? existing[0].step_order + 1 : 1
  const rows = steps.map((s) => ({
    application_id: applicationId,
    step_name: s.step_name,
    step_order: nextOrder++,
    description: s.description ?? null,
    phase: s.phase ?? null,
    is_expert_step: true,
    is_completed: false,
  }))
  const { error: insertErr } = await q.insertApplicationSteps(rows)
  if (insertErr) return { error: insertErr.message }
  return { error: null }
}
