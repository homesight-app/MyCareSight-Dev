import sql from '@/db'

export interface OnboardingToken {
  id: string
  agency_id: string
  token: string
  expires_at: string
  use_count: number
  created_by: string
  note: string | null
  created_at: string
}

export interface AgencyKeyStaff {
  id: string
  agency_id: string
  officer_role: string
  full_legal_name: string | null
  telephone: string | null
  email: string | null
  date_of_birth: string | null
  ssn_last4: string | null
  home_address_street: string | null
  home_address_city: string | null
  home_address_state: string | null
  home_address_zip: string | null
  date_of_hire: string | null
  is_licensed: boolean | null
  license_type: string | null
  ownership_percentage: string | null
  professional_license_number: string | null
  employment_type: string | null
  user_profile_id: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function getActiveOnboardingToken(agencyId: string) {
  try {
    const now = new Date().toISOString()
    const rows = await sql`
      SELECT * FROM agency_onboarding_tokens
      WHERE agency_id = ${agencyId}
        AND expires_at > ${now}
      ORDER BY created_at DESC
      LIMIT 1
    `
    return { data: (rows[0] ?? null) as OnboardingToken | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getOnboardingTokenByValue(tokenValue: string) {
  try {
    const rows = await sql`
      SELECT * FROM agency_onboarding_tokens
      WHERE token = ${tokenValue}
      LIMIT 1
    `
    return { data: (rows[0] ?? null) as OnboardingToken | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertOnboardingToken(
  payload: { agency_id: string; created_by: string; expires_at: string; note?: string | null }
) {
  try {
    const rows = await sql`
      INSERT INTO agency_onboarding_tokens ${sql(payload)}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Insert returned no rows')
    return { data: rows[0] as OnboardingToken, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function expireTokensForAgency(agencyId: string) {
  try {
    const now = new Date().toISOString()
    await sql`
      UPDATE agency_onboarding_tokens
      SET expires_at = ${now}
      WHERE agency_id = ${agencyId}
        AND expires_at > ${now}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function incrementTokenUseCount(tokenId: string, currentCount: number) {
  try {
    await sql`
      UPDATE agency_onboarding_tokens
      SET use_count = ${currentCount + 1}
      WHERE id = ${tokenId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getKeyStaffByAgencyId(agencyId: string) {
  try {
    const rows = await sql`
      SELECT * FROM agency_key_staff
      WHERE agency_id = ${agencyId}
        AND status = 'active'
      ORDER BY created_at ASC
    `
    return { data: rows as unknown as AgencyKeyStaff[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertKeyStaffMember(
  agencyId: string,
  officerRole: string,
  payload: Record<string, unknown>
) {
  try {
    const data = { agency_id: agencyId, officer_role: officerRole, officer_roles: [officerRole], ...payload }
    const keys = Object.keys(data) as unknown as any[]
    const rows = await sql`INSERT INTO agency_key_staff ${sql(data, ...keys)} RETURNING *`
    if (!rows[0]) throw new Error('Insert returned no rows')
    return { data: rows[0] as AgencyKeyStaff, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function upsertKeyStaffMember(
  agencyId: string,
  officerRole: string,
  payload: Record<string, unknown>
) {
  try {
    const existingRows = await sql`
      SELECT id, officer_roles FROM agency_key_staff
      WHERE agency_id = ${agencyId}
        AND officer_role = ${officerRole}
        AND status = 'active'
      LIMIT 1
    `
    const existing = existingRows[0] as any | undefined

    if (existing?.id) {
      // Ensure this role is in the array (may have been backfilled as empty)
      const existingRoles = existing.officer_roles as unknown as string[]
      const mergedRoles = existingRoles.includes(officerRole) ? existingRoles : [...existingRoles, officerRole]
      const updateData = { ...payload, officer_roles: mergedRoles, updated_at: new Date().toISOString() }
      const updateKeys = Object.keys(updateData) as unknown as any[]
      const rows = await sql`
        UPDATE agency_key_staff
        SET ${sql(updateData, ...updateKeys)}
        WHERE id = ${existing.id}
        RETURNING *
      `
      if (!rows[0]) throw new Error('Update returned no rows')
      return { data: rows[0] as AgencyKeyStaff, error: null }
    }

    const insertData = { agency_id: agencyId, officer_role: officerRole, officer_roles: [officerRole], ...payload }
    const insertKeys = Object.keys(insertData) as unknown as any[]
    const rows = await sql`INSERT INTO agency_key_staff ${sql(insertData, ...insertKeys)} RETURNING *`
    if (!rows[0]) throw new Error('Insert returned no rows')
    return { data: rows[0] as AgencyKeyStaff, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateKeyStaffById(id: string, payload: Record<string, unknown>) {
  try {
    const data = { ...payload, updated_at: new Date().toISOString() }
    const keys = Object.keys(data) as unknown as any[]
    const rows = await sql`UPDATE agency_key_staff SET ${sql(data, ...keys)} WHERE id = ${id} RETURNING *`
    if (!rows[0]) throw new Error('Not found')
    return { data: rows[0] as AgencyKeyStaff, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function deactivateKeyStaffById(id: string) {
  try {
    await sql`
      UPDATE agency_key_staff
      SET status = 'inactive', updated_at = ${new Date().toISOString()}
      WHERE id = ${id}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
