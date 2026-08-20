'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformStaffOrAgencyRole } from '@/lib/permissions'

function revalidateAgencyDetailPages(agencyId: string) {
  revalidatePath(`/pages/admin/agencies/${agencyId}`)
  revalidatePath(`/pages/expert/agencies/${agencyId}`)
  revalidatePath(`/pages/agency/people`)
}

// Polls for the user_profiles row created by DB trigger after auth user insert.
async function waitForProfile(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500))
    const { data } = await supabaseAdmin.from('user_profiles').select('id').eq('id', userId).single()
    if (data) return true
  }
  return false
}

// Shared creation flow: auth user + profile update + role-table insert.
// On any failure after auth user creation, rolls back by deleting the auth user.
async function createUserForAgency(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  agencyId: string,
  role: 'company_owner' | 'care_coordinator' | 'staff_member',
  opts: { firstName: string; lastName: string; email: string; phone?: string }
): Promise<{ userId: string; error?: never } | { error: string; userId?: never }> {
  const normalizedEmail = opts.email.toLowerCase().trim()
  const fullName = `${opts.firstName} ${opts.lastName}`

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: randomBytes(16).toString('hex'),
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  })
  if (authError) return { error: authError.message }

  const userId = authData.user.id

  const profileAppeared = await waitForProfile(supabaseAdmin, userId)
  if (!profileAppeared) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return { error: 'User profile did not initialize in time. Please try again.' }
  }

  await supabaseAdmin
    .from('user_profiles')
    .update({ full_name: fullName, role, agency_id: agencyId, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (role === 'care_coordinator') {
    const { error: roleErr } = await supabaseAdmin.from('care_coordinators').insert({
      user_id: userId,
      agency_id: agencyId,
      first_name: opts.firstName,
      last_name: opts.lastName,
      email: normalizedEmail,
      status: 'active',
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { error: `Failed to create coordinator record: ${roleErr.message}` }
    }
  } else if (role === 'staff_member') {
    const { data: agency } = await supabaseAdmin
      .from('agencies')
      .select('agency_admin_ids')
      .eq('id', agencyId)
      .single()
    const adminIds = (agency?.agency_admin_ids as string[] | null) ?? []
    const { error: roleErr } = await supabaseAdmin.from('caregiver_members').insert({
      user_id: userId,
      company_owner_id: adminIds[0] ?? null,
      agency_id: agencyId,
      first_name: opts.firstName,
      last_name: opts.lastName,
      email: normalizedEmail,
      role: 'Caregiver',
      status: 'active',
      documents: {},
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { error: `Failed to create caregiver record: ${roleErr.message}` }
    }
  } else if (role === 'company_owner') {
    const { error: roleErr } = await supabaseAdmin.from('agency_admins').insert({
      user_id: userId,
      company_owner_id: userId,
      contact_name: fullName,
      contact_email: normalizedEmail,
      contact_phone: opts.phone ?? null,
      status: 'active',
      agency_id: agencyId,
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { error: `Failed to create admin record: ${roleErr.message}` }
    }
    // Link to agency.agency_admin_ids
    const { data: agency } = await supabaseAdmin
      .from('agencies')
      .select('agency_admin_ids')
      .eq('id', agencyId)
      .single()
    const adminIds = (agency?.agency_admin_ids as string[] | null) ?? []
    await supabaseAdmin
      .from('agencies')
      .update({ agency_admin_ids: [...adminIds, userId], updated_at: new Date().toISOString() })
      .eq('id', agencyId)
  }

  return { userId }
}

// ——— Status toggles ——————————————————————————————————————

export async function updateAgencyAdminStatus(
  agencyId: string,
  adminId: string,
  status: 'active' | 'inactive'
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = createAdminClient()
  const { data: current } = await supabase
    .from('agency_admins')
    .select('status')
    .eq('id', adminId)
    .eq('agency_id', agencyId)
    .single()

  const { error } = await supabase
    .from('agency_admins')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', adminId)
    .eq('agency_id', agencyId)

  if (error) return { error: error.message }

  await supabase.from('audit_log').insert({
    agency_id: agencyId,
    table_name: 'agency_admins',
    record_id: adminId,
    action: 'UPDATE_STATUS',
    performed_by_user_id: session.user.id,
    details: { old_status: current?.status ?? null, new_status: status },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function updateCaregiverStatus(
  agencyId: string,
  caregiverId: string,
  status: 'active' | 'inactive'
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = createAdminClient()
  const { data: current } = await supabase
    .from('caregiver_members')
    .select('status')
    .eq('id', caregiverId)
    .eq('agency_id', agencyId)
    .single()

  const { error } = await supabase
    .from('caregiver_members')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', caregiverId)
    .eq('agency_id', agencyId)

  if (error) return { error: error.message }

  await supabase.from('audit_log').insert({
    agency_id: agencyId,
    table_name: 'caregiver_members',
    record_id: caregiverId,
    action: 'UPDATE_STATUS',
    performed_by_user_id: session.user.id,
    details: { old_status: current?.status ?? null, new_status: status },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function updateCareCoordinatorStatus(
  agencyId: string,
  coordinatorId: string,
  status: 'active' | 'inactive'
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = createAdminClient()
  const { data: current } = await supabase
    .from('care_coordinators')
    .select('status')
    .eq('id', coordinatorId)
    .eq('agency_id', agencyId)
    .single()

  const { error } = await supabase
    .from('care_coordinators')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', coordinatorId)
    .eq('agency_id', agencyId)

  if (error) return { error: error.message }

  await supabase.from('audit_log').insert({
    agency_id: agencyId,
    table_name: 'care_coordinators',
    record_id: coordinatorId,
    action: 'UPDATE_STATUS',
    performed_by_user_id: session.user.id,
    details: { old_status: current?.status ?? null, new_status: status },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

// ——— Create new users ————————————————————————————————————

export async function addCaregiverForAgency(
  agencyId: string,
  opts: { firstName: string; lastName: string; email: string }
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabaseAdmin = createAdminClient()
  const result = await createUserForAgency(supabaseAdmin, agencyId, 'staff_member', opts)
  if ('error' in result) return { error: result.error }

  await supabaseAdmin.from('audit_log').insert({
    agency_id: agencyId,
    table_name: 'caregiver_members',
    record_id: result.userId,
    action: 'GRANT_SYSTEM_ACCESS',
    performed_by_user_id: session.user.id,
    details: { credential: 'staff_member', contact_name: `${opts.firstName} ${opts.lastName}` },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function addCareCoordinatorForAgency(
  agencyId: string,
  opts: { firstName: string; lastName: string; email: string }
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabaseAdmin = createAdminClient()
  const result = await createUserForAgency(supabaseAdmin, agencyId, 'care_coordinator', opts)
  if ('error' in result) return { error: result.error }

  await supabaseAdmin.from('audit_log').insert({
    agency_id: agencyId,
    table_name: 'care_coordinators',
    record_id: result.userId,
    action: 'GRANT_SYSTEM_ACCESS',
    performed_by_user_id: session.user.id,
    details: { credential: 'care_coordinator', contact_name: `${opts.firstName} ${opts.lastName}` },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function createAndLinkAgencyAdmin(
  agencyId: string,
  opts: { firstName: string; lastName: string; email: string; phone?: string }
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabaseAdmin = createAdminClient()
  const result = await createUserForAgency(supabaseAdmin, agencyId, 'company_owner', opts)
  if ('error' in result) return { error: result.error }

  await supabaseAdmin.from('audit_log').insert({
    agency_id: agencyId,
    table_name: 'agency_admins',
    record_id: result.userId,
    action: 'GRANT_SYSTEM_ACCESS',
    performed_by_user_id: session.user.id,
    details: { credential: 'company_owner', contact_name: `${opts.firstName} ${opts.lastName}` },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

// ——— Edit existing users ————————————————————————————————

export async function updateCaregiverProfile(
  agencyId: string,
  caregiverId: string,
  updates: { first_name: string; last_name: string; phone?: string; job_title?: string }
) {
  const { error: authErr } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()

  const { data: cg, error: fetchErr } = await supabaseAdmin
    .from('caregiver_members')
    .select('user_id')
    .eq('id', caregiverId)
    .eq('agency_id', agencyId)
    .single()
  if (fetchErr || !cg) return { error: 'Caregiver not found' }

  const { error: updateErr } = await supabaseAdmin
    .from('caregiver_members')
    .update({
      first_name: updates.first_name,
      last_name: updates.last_name,
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.job_title !== undefined && { job_title: updates.job_title }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', caregiverId)
    .eq('agency_id', agencyId)
  if (updateErr) return { error: updateErr.message }

  if (cg.user_id) {
    await supabaseAdmin
      .from('user_profiles')
      .update({ full_name: `${updates.first_name} ${updates.last_name}`, updated_at: new Date().toISOString() })
      .eq('id', cg.user_id)
  }

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function updateCareCoordinatorProfile(
  agencyId: string,
  coordinatorId: string,
  updates: { first_name: string; last_name: string }
) {
  const { error: authErr } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()

  const { data: cc, error: fetchErr } = await supabaseAdmin
    .from('care_coordinators')
    .select('user_id')
    .eq('id', coordinatorId)
    .eq('agency_id', agencyId)
    .single()
  if (fetchErr || !cc) return { error: 'Coordinator not found' }

  const { error: updateErr } = await supabaseAdmin
    .from('care_coordinators')
    .update({
      first_name: updates.first_name,
      last_name: updates.last_name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', coordinatorId)
    .eq('agency_id', agencyId)
  if (updateErr) return { error: updateErr.message }

  await supabaseAdmin
    .from('user_profiles')
    .update({ full_name: `${updates.first_name} ${updates.last_name}`, updated_at: new Date().toISOString() })
    .eq('id', cc.user_id)

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function updateAgencyAdminProfile(
  agencyId: string,
  adminId: string,
  updates: { contact_name: string; contact_phone?: string }
) {
  const { error: authErr } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('agency_admins')
    .update({
      contact_name: updates.contact_name,
      ...(updates.contact_phone !== undefined && { contact_phone: updates.contact_phone }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', adminId)
    .eq('agency_id', agencyId)

  if (error) return { error: error.message }
  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

// ——— Promote informational key staff to credentialed user ——

export async function promoteKeyStaffToUser(
  keyStaffId: string,
  agencyId: string,
  role: 'company_owner' | 'care_coordinator',
  opts: { firstName: string; lastName: string; email: string; tempPassword: string }
): Promise<{ error: string | null }> {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabaseAdmin = createAdminClient()
  const normalizedEmail = opts.email.toLowerCase().trim()
  const fullName = `${opts.firstName} ${opts.lastName}`.trim()

  const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: opts.tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  })
  if (createErr) return { error: createErr.message }

  const userId = authData.user.id

  const profileAppeared = await waitForProfile(supabaseAdmin, userId)
  if (!profileAppeared) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return { error: 'User profile did not initialize in time. Please try again.' }
  }

  await supabaseAdmin
    .from('user_profiles')
    .update({ full_name: fullName, role, agency_id: agencyId, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (role === 'company_owner') {
    const { error: roleErr } = await supabaseAdmin.from('agency_admins').insert({
      user_id: userId,
      company_owner_id: userId,
      contact_name: fullName,
      contact_email: normalizedEmail,
      status: 'active',
      agency_id: agencyId,
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { error: `Failed to create admin record: ${roleErr.message}` }
    }
    const { data: agency } = await supabaseAdmin.from('agencies').select('agency_admin_ids').eq('id', agencyId).single()
    const adminIds = (agency?.agency_admin_ids as string[] | null) ?? []
    await supabaseAdmin
      .from('agencies')
      .update({ agency_admin_ids: [...adminIds, userId], updated_at: new Date().toISOString() })
      .eq('id', agencyId)
  } else {
    const { error: roleErr } = await supabaseAdmin.from('care_coordinators').insert({
      user_id: userId,
      agency_id: agencyId,
      first_name: opts.firstName,
      last_name: opts.lastName,
      email: normalizedEmail,
      status: 'active',
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { error: `Failed to create coordinator record: ${roleErr.message}` }
    }
  }

  const { error: linkErr } = await supabaseAdmin
    .from('agency_key_staff')
    .update({ user_profile_id: userId, updated_at: new Date().toISOString() })
    .eq('id', keyStaffId)
    .eq('agency_id', agencyId)
  if (linkErr) return { error: `User created but failed to link: ${linkErr.message}` }

  await supabaseAdmin.from('audit_log').insert({
    agency_id: agencyId,
    table_name: role === 'company_owner' ? 'agency_admins' : 'care_coordinators',
    record_id: userId,
    action: 'GRANT_SYSTEM_ACCESS',
    performed_by_user_id: session.user.id,
    details: { credential: role, user_profile_id: userId, key_staff_id: keyStaffId },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function changePersonCredential(
  agencyId: string,
  opts: {
    userProfileId: string
    adminRecordId: string | null
    coordinatorRecordId: string | null
    toCredential: 'company_owner' | 'care_coordinator'
    firstName: string
    lastName: string
    email: string
  }
): Promise<{ error: string | null }> {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = createAdminClient()
  const fullName = `${opts.firstName} ${opts.lastName}`.trim()
  const { userProfileId, toCredential } = opts

  if (toCredential === 'care_coordinator') {
    // Deactivate any existing admin record
    if (opts.adminRecordId) {
      await supabase
        .from('agency_admins')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', opts.adminRecordId)
        .eq('agency_id', agencyId)

      // Remove from agencies.agency_admin_ids
      const { data: agency } = await supabase.from('agencies').select('agency_admin_ids').eq('id', agencyId).single()
      const adminIds = ((agency?.agency_admin_ids as string[] | null) ?? []).filter((id: string) => id !== userProfileId)
      await supabase.from('agencies').update({ agency_admin_ids: adminIds, updated_at: new Date().toISOString() }).eq('id', agencyId)
    }

    // Reactivate existing coordinator record or create one
    if (opts.coordinatorRecordId) {
      await supabase
        .from('care_coordinators')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', opts.coordinatorRecordId)
        .eq('agency_id', agencyId)
    } else {
      const { error: insErr } = await supabase.from('care_coordinators').insert({
        user_id: userProfileId,
        agency_id: agencyId,
        first_name: opts.firstName,
        last_name: opts.lastName,
        email: opts.email,
        status: 'active',
      })
      if (insErr) return { error: insErr.message }
    }
  } else {
    // Deactivate existing coordinator record
    if (opts.coordinatorRecordId) {
      await supabase
        .from('care_coordinators')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', opts.coordinatorRecordId)
        .eq('agency_id', agencyId)
    }

    // Reactivate existing admin record or create one
    if (opts.adminRecordId) {
      await supabase
        .from('agency_admins')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', opts.adminRecordId)
        .eq('agency_id', agencyId)
    } else {
      const { error: insErr } = await supabase.from('agency_admins').insert({
        user_id: userProfileId,
        company_owner_id: userProfileId,
        contact_name: fullName,
        contact_email: opts.email,
        status: 'active',
        agency_id: agencyId,
      })
      if (insErr) return { error: insErr.message }
    }

    // Add to agencies.agency_admin_ids if not already present
    const { data: agency } = await supabase.from('agencies').select('agency_admin_ids').eq('id', agencyId).single()
    const adminIds = (agency?.agency_admin_ids as string[] | null) ?? []
    if (!adminIds.includes(userProfileId)) {
      await supabase.from('agencies').update({ agency_admin_ids: [...adminIds, userProfileId], updated_at: new Date().toISOString() }).eq('id', agencyId)
    }
  }

  await supabase
    .from('user_profiles')
    .update({ role: toCredential, updated_at: new Date().toISOString() })
    .eq('id', userProfileId)

  await supabase.from('audit_log').insert({
    agency_id: agencyId,
    table_name: toCredential === 'company_owner' ? 'agency_admins' : 'care_coordinators',
    record_id: userProfileId,
    action: 'CHANGE_CREDENTIAL',
    performed_by_user_id: session.user.id,
    details: {
      to_credential: toCredential,
      from_credential: toCredential === 'company_owner' ? 'care_coordinator' : 'company_owner',
    },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}
