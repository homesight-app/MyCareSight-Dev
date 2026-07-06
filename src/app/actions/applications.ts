'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { getApplicationForClose, closeApplicationUpdate, updateApplicationStatus } from '@/lib/supabase/query'
import { applyPlaybookToApplication } from './playbooks'

/**
 * Admin action to approve an application under review.
 * Sets status to 'approved'. Only callable by admin role.
 */
export async function approveApplication(applicationId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden' }

  const supabase = await createClient()
  const { error } = await updateApplicationStatus(supabase, applicationId, { status: 'approved' })
  if (error) return { error: error.message }

  revalidatePath('/pages/admin/licenses/applications/[id]', 'page')
  revalidatePath('/pages/admin/licenses', 'page')
  return { error: null }
}

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

  // Copy non-expert template steps. Admin/expert apps start directly as
  // 'in_progress', bypassing the DB trigger that normally seeds these steps
  // on the requested → in_progress transition.
  const { data: requirement } = await q.getLicenseRequirementByStateAndType(
    supabaseAdmin,
    data.state,
    data.application_name
  )
  if (requirement) {
    const { data: templateSteps } = await supabaseAdmin
      .from('license_requirement_steps')
      .select('step_name, step_order, description, instructions, phase')
      .eq('license_requirement_id', requirement.id)
      .or('is_expert_step.is.null,is_expert_step.eq.false')
      .order('step_order')

    if (templateSteps && templateSteps.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from('application_steps')
        .select('step_order')
        .eq('application_id', application.id)
        .order('step_order', { ascending: false })
        .limit(1)

      let nextOrder = (existing?.[0]?.step_order ?? 0) + 1

      await supabaseAdmin
        .from('application_steps')
        .insert(
          templateSteps.map((s) => ({
            application_id: application.id,
            step_name: s.step_name,
            step_order: nextOrder++,
            description: s.description,
            instructions: s.instructions,
            phase: s.phase,
            is_expert_step: false,
            is_completed: false,
          }))
        )
    }
  }

  revalidatePath('/pages/admin/agencies/[id]', 'page')
  revalidatePath('/pages/expert/agencies/[id]', 'page')
  return { error: null, data: { id: application.id } }
}

/**
 * Admin action to accept a pending application request.
 * Moves status to 'in_progress'. If an active playbook exists for the
 * application's license type + state, it is applied automatically to
 * launch a Program, and the agency owner is notified.
 */
export async function acceptApplicationRequest(applicationId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden' }

  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: app, error: fetchErr } = await q.getApplicationById(supabase, applicationId)
  if (fetchErr || !app) return { error: 'Application not found' }

  const { error: updateErr } = await q.updateApplicationById(supabase, applicationId, {
    status: 'in_progress',
    last_updated_date: today,
  })
  if (updateErr) return { error: updateErr.message }

  // Check if a playbook will be applied: direct reference (standalone) or state+name match (license-linked)
  const appRow = app as unknown as { application_name: string; state: string; company_owner_id: string | null; agency_id: string | null; playbook_id: string | null }

  let hasPlaybook = !!appRow.playbook_id
  if (!hasPlaybook) {
    const { data: playbooks } = await q.getPlaybooksWithRequirements(supabase)
    const matchKey = `${appRow.state}|${appRow.application_name}`
    hasPlaybook = (playbooks ?? []).some(p => {
      const lr = p.license_requirement as unknown as { state: string; license_type: string } | null
      return lr && `${lr.state}|${lr.license_type}` === matchKey
    })
  }

  if (hasPlaybook) {
    await applyPlaybookToApplication(applicationId)

    const adminClient = createAdminClient()
    const notifPayload = {
      title: 'Program Launched',
      message: `Your "${appRow.application_name}" program is now active and ready to begin.`,
      type: 'application_update',
      icon_type: 'check',
    }

    if (appRow.agency_id) {
      // Notify all agency admins for this agency
      const { data: admins } = await adminClient
        .from('agency_admins')
        .select('user_id')
        .eq('agency_id', appRow.agency_id)
      if (admins && admins.length > 0) {
        await adminClient.from('notifications').insert(
          admins.map(a => ({ ...notifPayload, user_id: a.user_id }))
        )
      }
    } else if (appRow.company_owner_id) {
      // Legacy: owner-scoped application
      await adminClient.from('notifications').insert({
        ...notifPayload,
        user_id: appRow.company_owner_id,
      })
    }
  }

  revalidatePath('/pages/admin/licenses', 'page')
  revalidatePath('/pages/admin/licenses/applications/[id]', 'page')
  revalidatePath('/pages/agency/programs', 'page')
  return { error: null }
}
