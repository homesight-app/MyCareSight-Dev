'use server'

import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { CACHE_TAG_AGENCIES_ID_NAME, CACHE_TAG_AGENCIES_ORDERED, CACHE_TAG_AGENCIES_FOR_BILLING, CACHE_TAG_AGENCY_CLIENT_DETAIL } from '@/lib/cache-tags'
import * as branches from '@/lib/repositories/agency-branches'
import { branchAssignmentSchema, branchFormSchema, programBranchRequestSchema } from '@/lib/schemas/agency-branches'
import { companyDetailsSchema } from '@/lib/schemas/profile'
import { zodErrorToFieldErrors } from '@/lib/validation'

function failure(error: unknown) {
  const duplicate = typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
  return { success: false as const, error: error instanceof branches.BranchError ? error.message
    : duplicate ? 'This branch code is already in use.' : 'Unable to complete this request. Refresh before retrying.' }
}

function refresh() {
  // A committed write stays successful even when cache invalidation fails.
  try {
    for (const tag of [CACHE_TAG_AGENCIES_ID_NAME, CACHE_TAG_AGENCIES_ORDERED, CACHE_TAG_AGENCIES_FOR_BILLING, CACHE_TAG_AGENCY_CLIENT_DETAIL]) revalidateTag(tag)
    revalidatePath('/pages/agency', 'layout')
    revalidatePath('/pages/admin/agencies')
    revalidatePath('/pages/admin/programs')
    revalidatePath('/pages/expert/clients')
  } catch { /* The next uncached request reads committed state. */ }
}

export async function listBranchesAction(input: unknown) {
  const parsed = z.object({ page: z.number().int().min(0).max(10000), search: z.string().trim().max(100) }).safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Invalid branch search.' }
  try { return { success: true as const, data: await branches.listBranches(parsed.data.page, parsed.data.search) } } catch (error) { return failure(error) }
}

export async function branchOptionsAction() {
  try { return { success: true as const, data: await branches.branchOptions() } } catch (error) { return failure(error) }
}

export async function saveBranchAction(input: unknown) {
  const parsed = branchFormSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Check the highlighted fields.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  try {
    const id = await branches.saveBranch(parsed.data)
    refresh()
    return { success: true as const, id }
  } catch (error) { return failure(error) }
}

export async function changeBranchStateAction(input: unknown) {
  const parsed = z.object({ id: z.uuid(), operation: z.enum(['default', 'activate', 'deactivate']) }).safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Invalid branch request.' }
  try {
    await branches.changeBranchState(parsed.data.id, parsed.data.operation)
    refresh()
    return { success: true as const }
  } catch (error) { return failure(error) }
}

export async function getRecordBranchesAction(input: unknown) {
  const parsed = branchAssignmentSchema.omit({ branchIds: true }).safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Invalid record.' }
  try { return { success: true as const, data: await branches.getRecordBranchAssignment(parsed.data.kind, parsed.data.recordId) } } catch (error) { return failure(error) }
}

export async function assignRecordBranchesAction(input: unknown) {
  const parsed = branchAssignmentSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Check your branch selection.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  try {
    await branches.assignRecordBranches(parsed.data.kind, parsed.data.recordId, parsed.data.branchIds)
    refresh()
    return { success: true as const }
  } catch (error) { return failure(error) }
}

export async function requestProgramBranchesAction(input: unknown) {
  const parsed = programBranchRequestSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Check your branch selection.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  try {
    const id = await branches.requestProgramWithBranches(parsed.data)
    refresh()
    return { success: true as const, id }
  } catch (error) {
    return error instanceof branches.BranchError ? failure(error) : { success: false as const, error: 'Unable to confirm this request. Refresh before retrying.' }
  }
}

export async function getAgencyInfoAction() {
  try { return { success: true as const, data: await branches.readAgencyInfo() } } catch (error) { return failure(error) }
}

export async function saveAgencyInfoAction(input: unknown) {
  const parsed = companyDetailsSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Check the highlighted fields.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  try {
    await branches.updateAgencyInfo(parsed.data)
    refresh()
    return { success: true as const }
  } catch (error) { return failure(error) }
}
