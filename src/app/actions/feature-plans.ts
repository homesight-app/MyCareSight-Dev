'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import {
  assignFeaturePlanInputSchema,
  deleteFeaturePlanInputSchema,
  featurePlanInputSchema,
  updateFeaturePlanInputSchema,
  type FeaturePlanInput,
  type UpdateFeaturePlanInput,
} from '@/lib/schemas/feature-plans'
import { zodErrorToFieldErrors } from '@/lib/validation'

type FormResult<T = undefined> = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  data?: T
}

function revalidatePlanPages() {
  revalidatePath('/pages/admin/plans')
  revalidatePath('/pages/admin/agencies/[id]', 'page')
  revalidatePath('/pages/expert/agencies/[id]', 'page')
}

async function runAsAdmin<T>(run: (userId: string) => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session || session.profile?.role !== 'admin') throw new Error('Forbidden')
  return withUserContext(session.user.id, 'admin', null, () => run(session.user.id))
}

function publicMutationError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === 'Forbidden') return 'Forbidden'
  return fallback
}

export async function createPlan(input: FeaturePlanInput): Promise<FormResult<{ id: string }>> {
  const parsed = featurePlanInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Check the highlighted fields.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  }

  try {
    const planId = await runAsAdmin(async userId => {
      const { data: plan, error } = await q.insertFeaturePlan({
        name: parsed.data.name,
        description: parsed.data.description || null,
        sort_order: parsed.data.sortOrder,
      })
      if (error || !plan) throw new Error('plan_insert_failed')

      const { error: capabilityError } = await q.setPlanCapabilities(plan.id, parsed.data.capabilityKeys)
      if (capabilityError) throw new Error('capability_write_failed')

      const { error: auditError } = await q.insertAuditLog({
        table_name: 'feature_plans',
        record_id: plan.id,
        action: 'CREATE',
        performed_by_user_id: userId,
        details: { capability_keys: parsed.data.capabilityKeys },
      })
      if (auditError) throw new Error('audit_failed')
      return plan.id as string
    })
    revalidatePlanPages()
    return { success: true, data: { id: planId } }
  } catch (error) {
    return { success: false, error: publicMutationError(error, 'Unable to create the plan.') }
  }
}

export async function updatePlan(input: UpdateFeaturePlanInput): Promise<FormResult> {
  const parsed = updateFeaturePlanInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Check the highlighted fields.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  }

  try {
    await runAsAdmin(async userId => {
      const { data: updatedPlan, error } = await q.updateFeaturePlanById(parsed.data.planId, {
        name: parsed.data.name,
        description: parsed.data.description || null,
        sort_order: parsed.data.sortOrder,
        updated_at: new Date().toISOString(),
      })
      if (error || !updatedPlan) throw new Error('plan_update_failed')

      const { error: capabilityError } = await q.setPlanCapabilities(
        parsed.data.planId,
        parsed.data.capabilityKeys
      )
      if (capabilityError) throw new Error('capability_write_failed')

      const { error: auditError } = await q.insertAuditLog({
        table_name: 'feature_plans',
        record_id: parsed.data.planId,
        action: 'UPDATE',
        performed_by_user_id: userId,
        details: { capability_keys: parsed.data.capabilityKeys },
      })
      if (auditError) throw new Error('audit_failed')
    })
    revalidatePlanPages()
    revalidatePath('/pages/agency', 'layout')
    return { success: true }
  } catch (error) {
    return { success: false, error: publicMutationError(error, 'Unable to update the plan.') }
  }
}

export async function deletePlan(planId: string): Promise<FormResult> {
  const parsed = deleteFeaturePlanInputSchema.safeParse({ planId })
  if (!parsed.success) return { success: false, error: 'Invalid plan.' }

  try {
    await runAsAdmin(async userId => {
      const { count, error: countError } = await q.getAgencyCountForPlan(parsed.data.planId)
      if (countError) throw new Error('agency_count_failed')
      if (count > 0) throw new Error(`assigned:${count}`)

      const { data: deletedPlan, error } = await q.deleteFeaturePlanById(parsed.data.planId)
      if (error || !deletedPlan) throw new Error('plan_delete_failed')
      const { error: auditError } = await q.insertAuditLog({
        table_name: 'feature_plans',
        record_id: parsed.data.planId,
        action: 'DELETE',
        performed_by_user_id: userId,
        details: { operation: 'delete_feature_plan' },
      })
      if (auditError) throw new Error('audit_failed')
    })
    revalidatePlanPages()
    return { success: true }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('assigned:')) {
      const count = Number(error.message.split(':')[1])
      return { success: false, error: `Cannot delete — ${count} ${count === 1 ? 'agency is' : 'agencies are'} on this plan.` }
    }
    return { success: false, error: publicMutationError(error, 'Unable to delete the plan.') }
  }
}

export async function assignPlanToAgency(
  agencyId: string,
  planId: string | null
): Promise<FormResult> {
  const parsed = assignFeaturePlanInputSchema.safeParse({ agencyId, planId })
  if (!parsed.success) return { success: false, error: 'Invalid agency or plan.' }

  try {
    await runAsAdmin(async userId => {
      if (parsed.data.planId) {
        const { data: plan, error } = await q.getFeaturePlanById(parsed.data.planId)
        if (error || !plan) throw new Error('plan_not_found')
      }
      const { data: agency, error } = await q.updateAgencyPlanId(parsed.data.agencyId, parsed.data.planId)
      if (error || !agency) throw new Error('agency_update_failed')
      const { error: auditError } = await q.insertAuditLog({
        agency_id: parsed.data.agencyId,
        table_name: 'agencies',
        record_id: parsed.data.agencyId,
        action: 'ASSIGN_FEATURE_PLAN',
        performed_by_user_id: userId,
        details: { plan_id: parsed.data.planId },
      })
      if (auditError) throw new Error('audit_failed')
    })
    revalidatePlanPages()
    revalidatePath('/pages/agency', 'layout')
    return { success: true }
  } catch (error) {
    return { success: false, error: publicMutationError(error, 'Unable to assign the plan.') }
  }
}
