import type { Supabase } from '../types'

/** Credentials for a user (caregiver_credentials), ordered by expiration_date ascending. */
export async function getCertificationsByUserId(supabase: Supabase, userId: string) {
  return supabase
    .from('caregiver_credentials')
    .select('id, agency_id, caregiver_member_id, user_id, credential_id, source_credential_name, credential_number, state, issue_date, expiration_date, issuing_authority, status, document_url, verified, source_table, source_record_id, notes, created_at, updated_at')
    .eq('user_id', userId)
    .order('expiration_date', { ascending: true })
}
