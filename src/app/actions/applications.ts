'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { getApplicationForClose, closeApplicationUpdate } from '@/lib/supabase/query'

/**
 * Close an application. Allowed when progress is 100%.
 * Expert and admin can close from the application detail page.
 */
export async function closeApplication(applicationId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: app, error: fetchError } = await getApplicationForClose(supabase, applicationId)

  if (fetchError || !app) {
    return { error: 'Application not found' }
  }

  if (app.status === 'closed') {
    return { error: null } // already closed
  }

  const progress = app.progress_percentage ?? 0
  if (progress < 100) {
    return { error: 'Application can only be closed when progress is 100%' }
  }

  const { error: updateError } = await closeApplicationUpdate(supabase, applicationId)

  if (updateError) {
    return { error: updateError.message }
  }
  return { error: null }
}

/**
 * Admin/expert action to create a license application on behalf of an agency.
 * Sets agency_id; leaves company_owner_id null (agency-owned, not user-owned).
 */
export async function createApplicationForAgency(
  agencyId: string,
  data: {
    application_name: string
    state: string
    license_type_id?: string | null
  }
): Promise<{ error: string | null; data: { id: string } | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabaseAdmin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  // Auto-approve: admin/expert bypass the "requested" review step.
  // Experts are also auto-assigned to the application they initiate.
  const assignedExpertId = role === 'expert' ? session.user.id : null

  const { data: application, error: insertError } = await q.insertApplicationRow(supabaseAdmin, {
    agency_id: agencyId,
    company_owner_id: null,
    application_name: data.application_name,
    state: data.state,
    license_type_id: data.license_type_id ?? null,
    status: 'in_progress',
    assigned_expert_id: assignedExpertId,
    progress_percentage: 0,
    started_date: today,
    last_updated_date: today,
    submitted_date: today,
  })

  if (insertError || !application) return { error: insertError?.message ?? 'Insert failed', data: null }

  const { error: rpcError } = await q.rpcCopyExpertStepsToApplication(
    supabaseAdmin,
    application.id,
    data.state,
    data.application_name
  )
  if (rpcError) return { error: rpcError.message, data: null }

  revalidatePath('/pages/admin/agencies/[id]', 'page')
  revalidatePath('/pages/expert/agencies/[id]', 'page')
  return { error: null, data: { id: application.id } }
}
