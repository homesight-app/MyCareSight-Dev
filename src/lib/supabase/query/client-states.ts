import sql from '@/db'

type ClientStateRow = {
  id: string
  client_id: string
  state: string
}

/** Get client_states by client_id. */
export async function getClientStatesByClientId(clientId: string) {
  try {
    const rows = await sql`
      SELECT id, client_id, state FROM client_states WHERE client_id = ${clientId}
    `
    return { data: rows as unknown as ClientStateRow[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get client_states by client ids. */
export async function getClientStatesByClientIds(clientIds: string[]) {
  if (clientIds.length === 0) return { data: [] as unknown as ClientStateRow[], error: null }
  try {
    const rows = await sql`
      SELECT id, client_id, state FROM client_states WHERE client_id = ANY(${clientIds as any})
    `
    return { data: rows as unknown as ClientStateRow[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
