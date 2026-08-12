'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'

function assertAdmin(role: string | null | undefined): string | null {
  return role === 'admin' ? null : 'Forbidden'
}

function revalidatePlanPages() {
  revalidatePath('/pages/admin/plans')
  revalidatePath('/pages/admin/agencies/[id]', 'page')
  revalidatePath('/pages/expert/agencies/[id]', 'page')
}

export async function createPlan(
  name: string,
  description: string | null,
  sortOrder: number,
  featureKeys: string[]
): Promise<{ error: string | null; data: { id: string } | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const roleErr = assertAdmin(session.profile?.role)
  if (roleErr) return { error: roleErr, data: null }

  const supabase = createAdminClient()
  const { data: plan, error } = await q.insertFeaturePlan(supabase, {
    name: name.trim(),
    description: description?.trim() || null,
    sort_order: sortOrder,
  })
  if (error || !plan) return { error: error?.message ?? 'Failed to create plan', data: null }

  const { error: featErr } = await q.setPlanFeatures(supabase, plan.id, featureKeys)
  if (featErr) return { error: featErr.message, data: null }

  revalidatePlanPages()
  return { error: null, data: { id: plan.id } }
}

export async function updatePlan(
  planId: string,
  name: string,
  description: string | null,
  sortOrder: number,
  featureKeys: string[]
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const roleErr = assertAdmin(session.profile?.role)
  if (roleErr) return { error: roleErr }

  const supabase = createAdminClient()
  const { error } = await q.updateFeaturePlanById(supabase, planId, {
    name: name.trim(),
    description: description?.trim() || null,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  const { error: featErr } = await q.setPlanFeatures(supabase, planId, featureKeys)
  if (featErr) return { error: featErr.message }

  revalidatePlanPages()
  return { error: null }
}

export async function deletePlan(planId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const roleErr = assertAdmin(session.profile?.role)
  if (roleErr) return { error: roleErr }

  const supabase = createAdminClient()
  const { count } = await q.getAgencyCountForPlan(supabase, planId)
  if ((count ?? 0) > 0) {
    return { error: `Cannot delete — ${count} ${count === 1 ? 'agency is' : 'agencies are'} on this plan.` }
  }

  const { error } = await q.deleteFeaturePlanById(supabase, planId)
  if (error) return { error: error.message }

  revalidatePlanPages()
  return { error: null }
}

export async function assignPlanToAgency(
  agencyId: string,
  planId: string | null
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const roleErr = assertAdmin(session.profile?.role)
  if (roleErr) return { error: roleErr }

  const supabase = createAdminClient()
  const { error } = await q.updateAgencyPlanId(supabase, agencyId, planId)
  if (error) return { error: error.message }

  revalidatePlanPages()
  revalidatePath('/pages/agency', 'layout')
  return { error: null }
}
