import sql from '@/db'

export async function insertAuditLog(entry: {
  table_name: string
  record_id: string | null
  action: string
  performed_by_user_id: string | null
  details: Record<string, unknown>
  agency_id?: string | null
}): Promise<{ error: Error | null }> {
  try {
    await sql`
      INSERT INTO audit_log
        (table_name, record_id, action, performed_by_user_id, details, agency_id)
      VALUES
        (
          ${entry.table_name},
          ${entry.record_id ?? null},
          ${entry.action},
          ${entry.performed_by_user_id ?? null},
          ${JSON.stringify(entry.details)}::jsonb,
          ${entry.agency_id ?? null}
        )
    `
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) }
  }
}
