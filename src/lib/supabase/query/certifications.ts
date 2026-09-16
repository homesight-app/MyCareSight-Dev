import sql from '@/db'

export async function getCertificationsByUserId(userId: string) {
  try {
    const rows = await sql`
      SELECT id, agency_id, caregiver_member_id, user_id, credential_id,
             source_credential_name, credential_number, state, issue_date,
             expiration_date, issuing_authority, status, document_url, verified,
             source_table, source_record_id, notes, created_at, updated_at
      FROM caregiver_credentials
      WHERE user_id = ${userId}
      ORDER BY expiration_date ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
