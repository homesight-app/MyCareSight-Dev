'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getConfigurationValues } from '@/app/actions/configuration-values'

export interface CreateCertificationData {
  type: string
  license_number: string
  state?: string | null
  issue_date?: string | null
  expiration_date: string
  issuing_authority: string
  status: string
  document_url?: string | null
}

function mapCredentialToLegacyCert(row: Record<string, unknown>) {
  return {
    ...row,
    type: row.source_credential_name,
    license_number: row.credential_number,
  }
}

export async function createCertification(data: CreateCertificationData) {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { error: 'You must be logged in to create a certification', data: null }
    }

    const { data: staff, error: staffErr } = await supabase
      .from('caregiver_members')
      .select('id, agency_id, user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (staffErr || !staff?.agency_id) {
      return {
        error:
          'Your account must be linked to an agency staff profile to save certifications. Ask your agency to connect your login.',
        data: null,
      }
    }

    const { data: certification, error: insertError } = await supabase
      .from('caregiver_credentials')
      .insert({
        agency_id: staff.agency_id,
        caregiver_member_id: staff.id,
        user_id: user.id,
        source_credential_name: data.type,
        credential_number: data.license_number,
        state: data.state || null,
        issue_date: data.issue_date || null,
        expiration_date: data.expiration_date,
        issuing_authority: data.issuing_authority,
        status: data.status,
        document_url: data.document_url || null,
      })
      .select()
      .single()

    if (insertError) {
      return { error: insertError.message, data: null }
    }

    revalidatePath('/pages/caregiver/my-certifications')
    return {
      error: null,
      data: certification ? mapCredentialToLegacyCert(certification as Record<string, unknown>) : null,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create certification'
    return { error: msg, data: null }
  }
}

export async function getCertifications() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { error: 'You must be logged in', data: null }
    }

    const { data: certifications, error: fetchError } = await supabase
      .from('caregiver_credentials')
      .select('*')
      .eq('user_id', user.id)
      .order('expiration_date', { ascending: true })

    if (fetchError) {
      return { error: fetchError.message, data: null }
    }

    const mapped = (certifications || []).map((c) => mapCredentialToLegacyCert(c as Record<string, unknown>))
    return { error: null, data: mapped }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch certifications'
    return { error: msg, data: null }
  }
}

export async function getCertificationTypes() {
  try {
    const result = await getConfigurationValues('CERTIFICATION_TYPE')
    if (result.error) return { error: String(result.error), data: null }
    return { error: null, data: (result.data ?? []).map(v => ({ id: v.id, name: v.name })) }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch certification types'
    return { error: msg, data: null }
  }
}

export interface UpdateCertificationData {
  type: string
  license_number: string
  state?: string | null
  issue_date?: string | null
  expiration_date: string
  issuing_authority: string
  status: string
  document_url?: string | null
}

export async function updateCertification(certificationId: string, data: UpdateCertificationData) {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { error: 'You must be logged in to update a certification', data: null }
    }

    const { data: certification, error: updateError } = await supabase
      .from('caregiver_credentials')
      .update({
        source_credential_name: data.type,
        credential_number: data.license_number,
        state: data.state || null,
        issue_date: data.issue_date || null,
        expiration_date: data.expiration_date,
        issuing_authority: data.issuing_authority,
        status: data.status,
        document_url: data.document_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', certificationId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      return { error: updateError.message, data: null }
    }

    revalidatePath('/pages/caregiver/my-certifications')
    revalidatePath(`/pages/caregiver/my-certifications/${certificationId}`)
    return {
      error: null,
      data: certification ? mapCredentialToLegacyCert(certification as Record<string, unknown>) : null,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update certification'
    return { error: msg, data: null }
  }
}

export async function getCertification(certificationId: string) {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { error: 'You must be logged in', data: null }
    }

    const { data: certification, error: fetchError } = await supabase
      .from('caregiver_credentials')
      .select('*')
      .eq('id', certificationId)
      .eq('user_id', user.id)
      .single()

    if (fetchError) {
      return { error: fetchError.message, data: null }
    }

    return {
      error: null,
      data: certification ? mapCredentialToLegacyCert(certification as Record<string, unknown>) : null,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch certification'
    return { error: msg, data: null }
  }
}
