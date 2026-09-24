'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import sql from '@/db'
import {
  getApplicationForClose,
  closeApplicationUpdate,
  updateApplicationStatus,
} from '@/lib/supabase/query'
import { applyPlaybookToApplication } from './playbooks'
import { changeApplicationStatusWithNote } from '@/lib/repositories/internal-note-writes'

/**
 * Admin action to approve an application under review.
 * Sets status to 'approved'. Only callable by admin role.
 */
export async function approveApplication(applicationId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden' }

  const { error } = await updateApplicationStatus(applicationId, { status: 'approved' })
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
  const { data: app, error: fetchError } = await getApplicationForClose(applicationId)

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

  const { error: updateError } = await closeApplicationUpdate(applicationId)

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

  const { error } = await updateApplicationStatus(applicationId, { status: 'closed' })
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

  const today = new Date().toISOString().split('T')[0]

  // Auto-approve: admin/expert bypass the "requested" review step.
  // Experts are also auto-assigned to the application they initiate.
  const assignedExpertId = role === 'expert' ? session.user.id : null

  const { data: application, error: insertError } = await q.insertApplicationRow({
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
    application.id,
    data.state,
    data.application_name
  )
  if (rpcError) return { error: rpcError.message, data: null }

  // Copy non-expert template steps. Admin/expert apps start directly as
  // 'in_progress', bypassing the DB trigger that normally seeds these steps
  // on the requested → in_progress transition.
  const { data: requirement } = await q.getLicenseRequirementByStateAndType(
    data.state,
    data.application_name
  )
  if (requirement) {
    const templateSteps = await sql<{ step_name: string; step_order: number; description: string | null; instructions: string | null; phase: string | null }[]>`
      SELECT step_name, step_order, description, instructions, phase
      FROM license_requirement_steps
      WHERE license_requirement_id = ${requirement.id}
        AND (is_expert_step IS NULL OR is_expert_step = false)
      ORDER BY step_order ASC
    `

    if (templateSteps.length > 0) {
      const [lastStep] = await sql<{ step_order: number }[]>`
        SELECT step_order FROM application_steps
        WHERE application_id = ${application.id}
        ORDER BY step_order DESC LIMIT 1
      `
      const baseOrder = (lastStep?.step_order ?? 0) + 1
      const stepPayloads = templateSteps.map((s, i) => ({
        application_id: application.id,
        step_name: s.step_name,
        step_order: baseOrder + i,
        description: s.description,
        instructions: s.instructions,
        phase: s.phase,
        is_expert_step: false,
        is_completed: false,
      }))
      await sql`INSERT INTO application_steps ${sql(stepPayloads)}`
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

  const today = new Date().toISOString().split('T')[0]

  const { data: app, error: fetchErr } = await q.getApplicationById(applicationId)
  if (fetchErr || !app) return { error: 'Application not found' }

  const { error: updateErr } = await q.updateApplicationById(applicationId, {
    status: 'in_progress',
    last_updated_date: today,
  })
  if (updateErr) return { error: updateErr.message }

  // Check if a playbook will be applied: direct reference (standalone) or state+name match (license-linked)
  const appRow = app as unknown as { application_name: string; state: string; company_owner_id: string | null; agency_id: string | null; playbook_id: string | null }

  let hasPlaybook = !!appRow.playbook_id
  if (!hasPlaybook) {
    const { data: playbooks } = await q.getPlaybooksWithRequirements()
    const matchKey = `${appRow.state}|${appRow.application_name}`
    hasPlaybook = (playbooks ?? []).some(p => {
      const lr = p.license_requirement as unknown as { state: string; license_type: string } | null
      return lr && `${lr.state}|${lr.license_type}` === matchKey
    })
  }

  if (hasPlaybook) {
    await applyPlaybookToApplication(applicationId)

    const notifPayload = {
      title: 'Program Launched',
      message: `Your "${appRow.application_name}" program is now active and ready to begin.`,
      type: 'application_update',
      icon_type: 'check',
    }

    if (appRow.agency_id) {
      const admins = await sql<{ user_id: string }[]>`
        SELECT user_id FROM agency_admins WHERE agency_id = ${appRow.agency_id}
      `
      if (admins.length > 0) {
        await sql`INSERT INTO notifications ${sql(admins.map(a => ({ ...notifPayload, user_id: a.user_id })))}`
      }
    } else if (appRow.company_owner_id) {
      await sql`INSERT INTO notifications ${sql([{ ...notifPayload, user_id: appRow.company_owner_id }])}`
    }
  }

  revalidatePath('/pages/admin/licenses', 'page')
  revalidatePath('/pages/admin/licenses/applications/[id]', 'page')
  revalidatePath('/pages/admin/programs', 'page')
  revalidatePath('/pages/admin/programs/[applicationId]', 'page')
  revalidatePath('/pages/agency/programs', 'page')
  return { error: null }
}

/**
 * Admin action to reject a pending program request.
 * Moves status to 'rejected' and notifies the agency.
 */
export async function rejectProgramRequest(applicationId: string): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden' }

  const today = new Date().toISOString().split('T')[0]

  const { data: app, error: fetchErr } = await q.getApplicationById(applicationId)
  if (fetchErr || !app) return { error: 'Application not found' }

  const { error: updateErr } = await q.updateApplicationById(applicationId, {
    status: 'rejected',
    last_updated_date: today,
  })
  if (updateErr) return { error: updateErr.message }

  const appRow = app as unknown as { application_name: string; company_owner_id: string | null; agency_id: string | null }

  const notifPayload = {
    title: 'Program Request Declined',
    message: `Your "${appRow.application_name}" program request was not approved at this time. Please contact us if you have questions.`,
    type: 'application_update',
    icon_type: 'exclamation',
    action_url: '/pages/agency/programs',
  }

  if (appRow.agency_id) {
    const admins = await sql<{ user_id: string }[]>`
      SELECT user_id FROM agency_admins WHERE agency_id = ${appRow.agency_id}
    `
    if (admins.length > 0) {
      await sql`INSERT INTO notifications ${sql(admins.map(a => ({ ...notifPayload, user_id: a.user_id })))}`
    }
  } else if (appRow.company_owner_id) {
    await sql`INSERT INTO notifications ${sql([{ ...notifPayload, user_id: appRow.company_owner_id }])}`
  }

  revalidatePath('/pages/admin/programs', 'page')
  revalidatePath('/pages/admin/programs/[applicationId]', 'page')
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

  const today = new Date().toISOString().split('T')[0]
  const assignedExpertId = role === 'expert' ? session.user.id : null

  const { data: application, error: insertError } = await q.insertApplicationRow({
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
  const { data: playbook } = await q.getPlaybookById(data.playbook_id)
  if (playbook?.category_id) {
    await sql`
      UPDATE applications
      SET category_id = ${playbook.category_id},
          subcategory_id = ${(playbook as { subcategory_id?: string | null }).subcategory_id ?? null}
      WHERE id = ${application.id}
    `
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

/** Manually close an application regardless of task completion. Admin/expert only. */
export async function closeApplicationManually(
  applicationId: string,
  reason: string
): Promise<{ error: string | null }> {
  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'Reason is required' }
  const result=await changeApplicationStatusWithNote({applicationId,operation:'close',reason:trimmedReason})
  if(result.error) return result

  revalidateApplicationPages(applicationId)
  return { error: null }
}

/** Manually mark an application complete regardless of task completion. Admin/expert only. */
export async function completeApplicationManually(
  applicationId: string,
  reason: string
): Promise<{ error: string | null }> {
  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'Notes are required' }
  const result=await changeApplicationStatusWithNote({applicationId,operation:'complete',reason:trimmedReason})
  if(result.error) return result

  revalidateApplicationPages(applicationId)
  return { error: null }
}

/** Re-open a closed or complete application back to in_progress. Admin/expert only. */
export async function reopenApplication(
  applicationId: string,
  reason: string
): Promise<{ error: string | null }> {
  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'Reason is required' }
  const result=await changeApplicationStatusWithNote({applicationId,operation:'reopen',reason:trimmedReason})
  if(result.error) return result

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

  const { error } = await q.updateApplicationById(applicationId, { application_name: trimmed })
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

  const [profile] = await sql<{ agency_id: string | null }[]>`
    SELECT agency_id FROM user_profiles WHERE id = ${session.user.id} LIMIT 1
  `

  if (!profile?.agency_id) return { error: 'Could not determine your agency. Please contact support.' }

  const todayStr = new Date().toISOString().split('T')[0]

  // Insert via user client (RLS-respecting); DB trigger fires here and sends
  // admin notifications without action_url.
  const { error: insertError } = await q.insertApplication({
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
  const cutoff = new Date(Date.now() - 15000).toISOString()

  const admins = await sql<{ id: string }[]>`SELECT id FROM user_profiles WHERE role = 'admin'`
  if (admins.length > 0) {
    const adminIds = admins.map(a => a.id)
    await sql`
      UPDATE notifications
      SET action_url = '/pages/admin/programs'
      WHERE user_id = ANY(${adminIds}::uuid[])
        AND action_url IS NULL
        AND created_at >= ${cutoff}
    `
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

  const [app] = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM applications WHERE id = ${applicationId} LIMIT 1
  `
  if (!app) return { error: 'Request not found' }
  if (app.status !== 'requested') return { error: 'This request can no longer be cancelled' }

  await sql`DELETE FROM applications WHERE id = ${applicationId} AND status = 'requested'`

  revalidatePath('/pages/agency/programs')
  revalidatePath('/pages/admin/programs')
  return { error: null }
}

export async function updateApplicationProgressAction(
  applicationId: string,
  progressPercentage: number
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden' }

  try {
    await sql`
      UPDATE applications
      SET progress_percentage = ${progressPercentage},
          last_updated_date = ${new Date().toISOString().split('T')[0]}
      WHERE id = ${applicationId}
    `
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Update failed' }
  }

  const [appRow] = await sql<{ agency_id: string | null }[]>`
    SELECT agency_id FROM applications WHERE id = ${applicationId} LIMIT 1
  `

  const { error: auditErr } = await q.insertAuditLog({
    agency_id: appRow?.agency_id ?? null,
    table_name: 'applications',
    record_id: applicationId,
    action: 'UPDATE',
    performed_by_user_id: session.user.id,
    details: { field: 'progress_percentage', value: progressPercentage },
  })
  if (auditErr) console.error('[applications/updateProgress] Audit log failed. applicationId=%s err=%s', applicationId, auditErr.message)

  revalidatePath(`/pages/admin/programs/${applicationId}`)
  revalidatePath(`/pages/expert/programs/${applicationId}`)
  revalidatePath(`/pages/agency/programs/${applicationId}`)
  return { error: null }
}
