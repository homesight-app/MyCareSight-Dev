'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import {
  getApplicationForClose,
  closeApplicationUpdate,
  updateApplicationStatus,
  closeApplicationManualUpdate,
  completeApplicationManualUpdate,
  reopenApplicationUpdate,
  getApplicationAgencyAndStatus,
} from '@/lib/supabase/query'
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
 * Admin action to approve a completed program (under_review → closed).
 */
export async function approveProgramComplete(applicationId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden' }

  const supabase = await createClient()
  const { error } = await updateApplicationStatus(supabase, applicationId, { status: 'closed' })
  if (error) return { error: error.message }

  revalidatePath('/pages/admin/programs')
  revalidatePath(`/pages/admin/programs/${applicationId}`)
  revalidatePath(`/pages/expert/programs/${applicationId}`)
  revalidatePath(`/pages/agency/programs/${applicationId}`)
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
  revalidatePath('/pages/admin/programs', 'page')
  revalidatePath('/pages/agency/programs', 'page')
  return { error: null }
}

/**
 * Admin/expert action to create a program (playbook-based application) directly
 * for an agency, bypassing the "requested" review step.
 */
export async function createProgramForAgency(
  agencyId: string,
  data: { application_name: string; state: string; playbook_id: string }
): Promise<{ error: string | null; data: { id: string } | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabaseAdmin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const assignedExpertId = role === 'expert' ? session.user.id : null

  const { data: application, error: insertError } = await q.insertApplicationRow(supabaseAdmin, {
    agency_id: agencyId,
    company_owner_id: null,
    application_name: data.application_name,
    state: data.state,
    license_type_id: null,
    playbook_id: data.playbook_id,
    status: 'in_progress',
    assigned_expert_id: assignedExpertId,
    progress_percentage: 0,
    started_date: today,
    last_updated_date: today,
    submitted_date: today,
  })

  if (insertError || !application) return { error: insertError?.message ?? 'Insert failed', data: null }

  // Copy category/subcategory from the selected playbook
  const { data: playbook } = await q.getPlaybookById(supabaseAdmin, data.playbook_id)
  if (playbook?.category_id) {
    await supabaseAdmin.from('applications').update({
      category_id: playbook.category_id,
      subcategory_id: (playbook as { subcategory_id?: string | null }).subcategory_id ?? null,
    }).eq('id', application.id)
  }

  await applyPlaybookToApplication(application.id)

  revalidatePath('/pages/admin/agencies/[id]', 'page')
  revalidatePath('/pages/expert/agencies/[id]', 'page')
  revalidatePath('/pages/admin/programs', 'page')
  return { error: null, data: { id: application.id } }
}

function revalidateApplicationPages(applicationId: string) {
  revalidatePath('/pages/admin/licenses/applications/[id]', 'page')
  revalidatePath('/pages/admin/programs', 'page')
  revalidatePath(`/pages/admin/programs/${applicationId}`)
  revalidatePath(`/pages/expert/programs/${applicationId}`)
  revalidatePath(`/pages/agency/programs/${applicationId}`)
}

async function insertApplicationStatusNote(
  applicationId: string,
  agencyId: string,
  userId: string,
  content: string
) {
  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin.from('internal_notes').insert({
    agency_id: agencyId,
    subject_type: 'application',
    subject_id: applicationId,
    content,
    created_by: userId,
  })
  if (error) console.error('[applications] Failed to insert status note:', error.message)
}

/** Manually close an application regardless of task completion. Admin/expert only. */
export async function closeApplicationManually(
  applicationId: string,
  reason: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden' }

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'Reason is required' }

  const supabase = await createClient()
  const { data: app, error: fetchErr } = await getApplicationAgencyAndStatus(supabase, applicationId)
  if (fetchErr || !app) return { error: 'Application not found' }
  if (!app.agency_id) return { error: 'Application has no agency' }
  if (app.status === 'approved' || app.status === 'rejected') {
    return { error: 'Cannot close an approved or rejected application' }
  }

  const { error } = await closeApplicationManualUpdate(supabase, applicationId, app.agency_id, session.user.id, trimmedReason)
  if (error) return { error: error.message }

  await insertApplicationStatusNote(
    applicationId,
    app.agency_id,
    session.user.id,
    `Application manually closed. Reason: ${trimmedReason}`
  )

  revalidateApplicationPages(applicationId)
  return { error: null }
}

/** Manually mark an application complete regardless of task completion. Admin/expert only. */
export async function completeApplicationManually(
  applicationId: string,
  reason: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden' }

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'Notes are required' }

  const supabase = await createClient()
  const { data: app, error: fetchErr } = await getApplicationAgencyAndStatus(supabase, applicationId)
  if (fetchErr || !app) return { error: 'Application not found' }
  if (!app.agency_id) return { error: 'Application has no agency' }
  if (app.status === 'approved' || app.status === 'rejected') {
    return { error: 'Cannot mark an approved or rejected application complete' }
  }

  const { error } = await completeApplicationManualUpdate(supabase, applicationId, app.agency_id, session.user.id, trimmedReason)
  if (error) return { error: error.message }

  await insertApplicationStatusNote(
    applicationId,
    app.agency_id,
    session.user.id,
    `Application marked complete. Notes: ${trimmedReason}`
  )

  revalidateApplicationPages(applicationId)
  return { error: null }
}

/** Re-open a closed or complete application back to in_progress. Admin/expert only. */
export async function reopenApplication(
  applicationId: string,
  reason: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden' }

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'Reason is required' }

  const supabase = await createClient()
  const { data: app, error: fetchErr } = await getApplicationAgencyAndStatus(supabase, applicationId)
  if (fetchErr || !app) return { error: 'Application not found' }
  if (!app.agency_id) return { error: 'Application has no agency' }
  if (app.status !== 'closed' && app.status !== 'complete') {
    return { error: 'Application is not closed or complete' }
  }

  const { error } = await reopenApplicationUpdate(supabase, applicationId, app.agency_id)
  if (error) return { error: error.message }

  await insertApplicationStatusNote(
    applicationId,
    app.agency_id,
    session.user.id,
    `Application re-opened. Reason: ${trimmedReason}`
  )

  revalidateApplicationPages(applicationId)
  return { error: null }
}

/** Rename a program (application_name). Admin and expert only. */
export async function renameApplication(
  applicationId: string,
  name: string,
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name is required' }

  const supabase = await createClient()
  const { error } = await q.updateApplicationById(supabase, applicationId, { application_name: trimmed })
  if (error) return { error: error.message }

  revalidatePath('/pages/admin/programs', 'page')
  revalidatePath('/pages/admin/programs/[applicationId]', 'page')
  revalidatePath('/pages/expert/clients', 'page')
  return { error: null }
}

/**
 * Agency owner/coordinator action to submit a program request.
 * Inserts the application with status='requested', then patches the
 * admin notifications created by the DB trigger to include the correct
 * action_url so the notification click routes to the Programs queue.
 */
export async function submitProgramRequest(data: {
  application_name: string
  state: string
  playbook_id: string
}): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') return { error: 'Forbidden' }

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('agency_id')
    .eq('id', session.user.id)
    .single()

  if (!profile?.agency_id) return { error: 'Could not determine your agency. Please contact support.' }

  const todayStr = new Date().toISOString().split('T')[0]

  // Insert via user client (RLS-respecting); DB trigger fires here and sends
  // admin notifications without action_url.
  const { error: insertError } = await q.insertApplication(supabase, {
    agency_id: profile.agency_id,
    company_owner_id: null,
    application_name: data.application_name,
    state: data.state,
    license_type_id: null,
    playbook_id: data.playbook_id,
    status: 'requested',
    progress_percentage: 0,
    started_date: todayStr,
    last_updated_date: todayStr,
    submitted_date: todayStr,
  })

  if (insertError) return { error: insertError.message }

  // Patch the notifications just created by the DB trigger so clicking them
  // routes the admin to the Programs page instead of Licenses.
  const adminClient = createAdminClient()
  const cutoff = new Date(Date.now() - 15000).toISOString()

  const { data: admins } = await adminClient
    .from('user_profiles')
    .select('id')
    .eq('role', 'admin')

  if (admins && admins.length > 0) {
    await adminClient
      .from('notifications')
      .update({ action_url: '/pages/admin/programs' })
      .in('user_id', admins.map((a: { id: string }) => a.id))
      .is('action_url', null)
      .gte('created_at', cutoff)
  }

  revalidatePath('/pages/agency/programs')
  return { error: null }
}

/**
 * Agency owner/coordinator action to cancel a pending program request.
 * Only works while the request is still in 'requested' status.
 */
export async function cancelProgramRequest(applicationId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') return { error: 'Forbidden' }

  // Verify via RLS client that this request belongs to the user's agency and is cancellable
  const supabase = await createClient()
  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, status')
    .eq('id', applicationId)
    .single()

  if (fetchError || !app) return { error: 'Request not found' }
  if (app.status !== 'requested') return { error: 'This request can no longer be cancelled' }

  // Delete via admin client (agency users lack DELETE on applications)
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('applications')
    .delete()
    .eq('id', applicationId)
    .eq('status', 'requested')

  if (error) return { error: error.message }

  revalidatePath('/pages/agency/programs')
  revalidatePath('/pages/admin/programs')
  return { error: null }
}
