import sql from '@/db'

export async function getAgencyKeyStaff(agencyId: string) {
  try {
    const rows = await sql`
      SELECT id, agency_id, officer_role, officer_roles, full_legal_name, telephone, email, ownership_percentage, user_profile_id, status
      FROM agency_key_staff
      WHERE agency_id = ${agencyId}
        AND status = 'active'
      ORDER BY created_at ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgencyAdmins(agencyId: string) {
  try {
    const rows = await sql`
      SELECT id, user_id, contact_name, contact_email, contact_phone, status
      FROM agency_admins
      WHERE agency_id = ${agencyId}
      ORDER BY contact_name ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgencyCareCoordinators(agencyId: string) {
  try {
    const rows = await sql`
      SELECT id, user_id, first_name, last_name, email, status
      FROM care_coordinators
      WHERE agency_id = ${agencyId}
      ORDER BY first_name ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
