'use server'

import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { CACHE_TAG_AGENCY_LEAD_STAGES } from '@/lib/cache-tags'

async function requireAgencyOwner(agencyId: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  const role = session.profile?.role
  if (role !== 'company_owner') return { error: 'Forbidden', session: null }
  if (session.profile?.agency_id !== agencyId) return { error: 'Forbidden', session: null }
  return { error: null, session }
}

export async function getAgencyLeadStagesAction(agencyId: string) {
  const { error } = await requireAgencyOwner(agencyId)
  if (error) return { success: false as const, error, data: null }
  const supabase = await createClient()
  const { data, error: dbErr } = await q.getAgencyLeadStages(supabase, agencyId)
  if (dbErr) return { success: false as const, error: dbErr.message, data: null }
  return { success: true as const, error: null, data }
}

export async function createAgencyLeadStageAction(
  agencyId: string,
  stageData: { label: string; color: string }
) {
  if (!stageData.label.trim()) {
    return { success: false as const, error: 'Label is required', data: null }
  }
  const { error } = await requireAgencyOwner(agencyId)
  if (error) return { success: false as const, error, data: null }
  const supabase = await createClient()
  const { data, error: dbErr } = await q.createAgencyLeadStage(supabase, agencyId, stageData)
  if (dbErr) return { success: false as const, error: dbErr.message, data: null }
  revalidateTag(CACHE_TAG_AGENCY_LEAD_STAGES)
  return { success: true as const, error: null, data }
}

export async function updateAgencyLeadStageAction(
  agencyId: string,
  stageId: string,
  updates: { label?: string; color?: string; sort_order?: number }
) {
  if (updates.label !== undefined && !updates.label.trim()) {
    return { success: false as const, error: 'Label is required', data: null }
  }
  const { error } = await requireAgencyOwner(agencyId)
  if (error) return { success: false as const, error, data: null }
  const supabase = await createClient()
  const { data, error: dbErr } = await q.updateAgencyLeadStage(supabase, stageId, updates)
  if (dbErr) return { success: false as const, error: dbErr.message, data: null }
  revalidateTag(CACHE_TAG_AGENCY_LEAD_STAGES)
  return { success: true as const, error: null, data }
}

export async function deleteAgencyLeadStageAction(agencyId: string, stageId: string) {
  const { error } = await requireAgencyOwner(agencyId)
  if (error) return { success: false as const, error }
  const supabase = await createClient()
  // First verify the stage is not locked
  const { data: stage } = await supabase
    .from('agency_lead_stages')
    .select('is_entry, is_won, is_lost')
    .eq('id', stageId)
    .eq('agency_id', agencyId)
    .single()
  if (!stage) return { success: false as const, error: 'Stage not found' }
  if (stage.is_entry || stage.is_won || stage.is_lost) {
    return { success: false as const, error: 'This stage is locked and cannot be deleted' }
  }
  const { error: dbErr } = await q.deleteAgencyLeadStage(supabase, stageId)
  if (dbErr) return { success: false as const, error: dbErr.message }
  revalidateTag(CACHE_TAG_AGENCY_LEAD_STAGES)
  return { success: true as const, error: null }
}

export async function reorderAgencyLeadStagesAction(agencyId: string, orderedIds: string[]) {
  const { error } = await requireAgencyOwner(agencyId)
  if (error) return { success: false as const, error }
  const supabase = await createClient()
  const { error: dbErr } = await q.reorderAgencyLeadStages(supabase, agencyId, orderedIds)
  if (dbErr) return { success: false as const, error: (dbErr as { message?: string }).message ?? 'Reorder failed' }
  revalidateTag(CACHE_TAG_AGENCY_LEAD_STAGES)
  return { success: true as const, error: null }
}
