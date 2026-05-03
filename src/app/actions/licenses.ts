'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'

/**
 * Revalidate the dashboard licenses page so the license list refetches after create/update.
 */
export async function revalidateLicensesPage() {
  revalidatePath('/pages/agency/licenses')
}

export type CreateLicenseForAgencyInput = {
  agencyId: string
  license_name: string
  state: string
  license_number?: string
  activated_date: string
  expiry_date: string
  renewal_due_date?: string
  document?: {
    url: string
    name: string
    type: string | null
    expiry_date?: string
  }
}

/**
 * Admin/expert server action to add a license directly to an agency.
 * Sets agency_id and leaves company_owner_id null (agency-owned, not user-owned).
 * Optionally attaches a license document record (file must be uploaded to storage by the caller first).
 */
export async function createLicenseForAgency(input: CreateLicenseForAgencyInput) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabaseAdmin = createAdminClient()

  const { data: newLicense, error } = await q.insertLicenseReturning(supabaseAdmin, {
    agency_id: input.agencyId,
    company_owner_id: null,
    license_name: input.license_name,
    license_number: input.license_number || null,
    state: input.state,
    status: 'active',
    activated_date: input.activated_date,
    expiry_date: input.expiry_date,
    renewal_due_date: input.renewal_due_date || null,
  })

  if (error) return { error: error.message, data: null }

  if (newLicense?.id && input.document) {
    const docPayload: Record<string, unknown> = {
      license_id: newLicense.id,
      document_name: input.document.name,
      document_url: input.document.url,
      document_type: input.document.type,
    }
    if (input.document.expiry_date) docPayload.expiry_date = input.document.expiry_date
    const { error: docError } = await q.insertLicenseDocument(supabaseAdmin, docPayload)
    if (docError) console.error('Failed to insert license_document:', docError.message)
  }

  revalidatePath('/pages/admin/agencies/[id]', 'page')
  revalidatePath('/pages/expert/agencies/[id]', 'page')
  return { error: null, data: { id: newLicense?.id } }
}
