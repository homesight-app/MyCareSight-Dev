import sql from '@/db'

/** Get all cases ordered by created_at desc. */
const CASES_COLUMNS = sql`id, case_id, client_id, business_name, owner_name, state, status, progress_percentage, expert_id, documents_count, steps_count, last_activity, started_date, created_at, updated_at`

export async function getCases() {
  try {
    const rows = await sql`
      SELECT ${CASES_COLUMNS} FROM cases ORDER BY created_at DESC LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get all cases ordered by started_date desc. */
export async function getCasesOrderedByStartedDate() {
  try {
    const rows = await sql`
      SELECT ${CASES_COLUMNS} FROM cases ORDER BY started_date DESC LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get case by id. */
export async function getCaseById(caseId: string) {
  try {
    const rows = await sql`
      SELECT ${CASES_COLUMNS} FROM cases WHERE id = ${caseId}
    `
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get cases by client_id. */
export async function getCasesByClientId(clientId: string) {
  try {
    const rows = await sql`
      SELECT ${CASES_COLUMNS} FROM cases WHERE client_id = ${clientId} LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get cases by client ids (optional select). */
export async function getCasesByClientIds(
  clientIds: string[],
  select = '*'
) {
  if (clientIds.length === 0) return { data: [], error: null }
  try {
    // select parameter is a trusted column list (not user input); use sql.unsafe only for this internal use
    const rows = await sql`
      SELECT ${sql.unsafe(select)} FROM cases WHERE client_id = ANY(${clientIds as any}) LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
