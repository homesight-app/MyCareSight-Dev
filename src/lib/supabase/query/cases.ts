import type { Supabase } from '../types'

/** Get all cases ordered by created_at desc. */
const CASES_COLUMNS = 'id, case_id, client_id, business_name, owner_name, state, status, progress_percentage, expert_id, documents_count, steps_count, last_activity, started_date, created_at, updated_at'

export async function getCases(supabase: Supabase) {
  return supabase.from('cases').select(CASES_COLUMNS).order('created_at', { ascending: false }).limit(500)
}

/** Get all cases ordered by started_date desc. */
export async function getCasesOrderedByStartedDate(supabase: Supabase) {
  return supabase.from('cases').select(CASES_COLUMNS).order('started_date', { ascending: false }).limit(500)
}

/** Get case by id. */
export async function getCaseById(supabase: Supabase, caseId: string) {
  return supabase.from('cases').select(CASES_COLUMNS).eq('id', caseId).single()
}

/** Get cases by client_id. */
export async function getCasesByClientId(supabase: Supabase, clientId: string) {
  return supabase.from('cases').select(CASES_COLUMNS).eq('client_id', clientId)
}

/** Get cases by client ids (optional select). */
export async function getCasesByClientIds(
  supabase: Supabase,
  clientIds: string[],
  select = '*'
) {
  if (clientIds.length === 0) return { data: [], error: null }
  return supabase.from('cases').select(select).in('client_id', clientIds)
}
