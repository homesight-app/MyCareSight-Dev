'use server'

import { randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requirePlatformStaffOrAgencyRole } from '@/lib/permissions'
import { hashPassword } from '@/lib/auth/password'
import { sendInvitationEmail } from '@/lib/email'
import sql from '@/db'
import * as q from '@/lib/supabase/query'

function revalidateAgencyDetailPages(agencyId: string) {
  revalidatePath(`/pages/admin/agencies/${agencyId}`)
  revalidatePath(`/pages/expert/agencies/${agencyId}`)
  revalidatePath(`/pages/agency/people`)
}

export async function getAgencyCaregiverDirectory(agencyId: string) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { data: null, error: authErr ?? 'Forbidden' }
  try {
    const [active, inactive] = await Promise.all([
      sql`
        SELECT id, user_id, first_name, last_name, email, phone, role, job_title, status
        FROM public.caregiver_members
        WHERE agency_id = ${agencyId}::uuid AND status = 'active'
        ORDER BY first_name, last_name, id
      `,
      sql`
        SELECT id, user_id, first_name, last_name, email, phone, role, job_title, status
        FROM public.caregiver_members
        WHERE agency_id = ${agencyId}::uuid AND status <> 'active'
        ORDER BY first_name, last_name, id
      `,
    ])
    await sql`
      INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
      VALUES (${agencyId}::uuid, 'caregiver_members', NULL, 'READ', ${session.user.id}::uuid,
        ${JSON.stringify({ operation: 'read_agency_caregiver_directory' })}::jsonb)
    `
    return { data: { active, inactive }, error: null }
  } catch {
    return { data: null, error: 'Unable to load caregivers.' }
  }
}

export async function getAgencyUserDirectory(agencyId: string) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { data: null, error: authErr ?? 'Forbidden' }
  try {
    const canAssignExistingOwner = ['admin', 'expert'].includes(session.profile.role)
    const [admins, availableAdmins, coordinators, caregivers] = await Promise.all([
      sql`
        SELECT id, user_id, contact_name, contact_email, contact_phone, status
        FROM public.agency_admins
        WHERE agency_id = ${agencyId}::uuid
        ORDER BY contact_name NULLS LAST, id
      `,
      canAssignExistingOwner
        ? sql`
            SELECT id, user_id, contact_name, contact_email, contact_phone, status
            FROM public.agency_admins
            WHERE agency_id IS NULL AND user_id IS NOT NULL
            ORDER BY contact_name NULLS LAST, id
          `
        : Promise.resolve([]),
      sql`
        SELECT id, user_id, first_name, last_name, email, status
        FROM public.care_coordinators
        WHERE agency_id = ${agencyId}::uuid
        ORDER BY first_name, last_name, id
      `,
      sql`
        SELECT id, user_id, first_name, last_name, email, phone, role, job_title, status
        FROM public.caregiver_members
        WHERE agency_id = ${agencyId}::uuid
        ORDER BY first_name, last_name, id
      `,
    ])
    await sql`
      INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
      VALUES (${agencyId}::uuid, 'user_profiles', NULL, 'READ', ${session.user.id}::uuid,
        ${JSON.stringify({ operation: 'read_agency_user_directory' })}::jsonb)
    `
    return { data: { admins, availableAdmins, coordinators, caregivers }, error: null }
  } catch {
    return { data: null, error: 'Unable to load agency users.' }
  }
}

async function createUserForAgency(
  agencyId: string,
  role: 'company_owner' | 'care_coordinator' | 'staff_member',
  opts: { firstName: string; lastName: string; email: string; phone?: string }
): Promise<{ userId: string; error?: never } | { error: string; userId?: never }> {
  const normalizedEmail = opts.email.toLowerCase().trim()
  const fullName = `${opts.firstName} ${opts.lastName}`
  const tempPassword = randomBytes(16).toString('hex')

  const [existingProfile] = await sql<{ id: string }[]>`
    SELECT id FROM user_profiles WHERE email = ${normalizedEmail} LIMIT 1
  `

  if (existingProfile) {
    const passwordHash = await hashPassword(tempPassword)
    await sql`
      UPDATE user_profiles SET password_hash = ${passwordHash}, role = ${role}, agency_id = ${agencyId}, updated_at = ${new Date().toISOString()}
      WHERE id = ${existingProfile.id}
    `
    await sendInvitationEmail(normalizedEmail, fullName, tempPassword)
    return { userId: existingProfile.id }
  }

  const userId = randomUUID()
  const passwordHash = await hashPassword(tempPassword)

  try {
    await sql`INSERT INTO user_profiles ${sql({
      id: userId,
      email: normalizedEmail,
      role,
      full_name: fullName,
      password_hash: passwordHash,
      is_active: true,
      agency_id: agencyId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })}`
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create user profile' }
  }

  if (role === 'care_coordinator') {
    try {
      await sql`INSERT INTO care_coordinators ${sql({
        user_id: userId,
        agency_id: agencyId,
        first_name: opts.firstName,
        last_name: opts.lastName,
        email: normalizedEmail,
        status: 'active',
      })}`
    } catch (err) {
      try { await sql`DELETE FROM user_profiles WHERE id = ${userId}` } catch {}
      return { error: `Failed to create coordinator record: ${err instanceof Error ? err.message : 'Unknown'}` }
    }
  } else if (role === 'staff_member') {
    const [adminRow] = await sql<{ id: string }[]>`
      SELECT id FROM agency_admins WHERE agency_id = ${agencyId} AND status = 'active' LIMIT 1
    `
    try {
      await sql`INSERT INTO caregiver_members ${sql({
        user_id: userId,
        company_owner_id: adminRow?.id ?? null,
        agency_id: agencyId,
        first_name: opts.firstName,
        last_name: opts.lastName,
        email: normalizedEmail,
        role: 'Caregiver',
        status: 'active',
        documents: {},
      })}`
    } catch (err) {
      try { await sql`DELETE FROM user_profiles WHERE id = ${userId}` } catch {}
      return { error: `Failed to create caregiver record: ${err instanceof Error ? err.message : 'Unknown'}` }
    }
  } else if (role === 'company_owner') {
    try {
      await sql`INSERT INTO agency_admins ${sql({
        user_id: userId,
        company_owner_id: userId,
        contact_name: fullName,
        contact_email: normalizedEmail,
        contact_phone: opts.phone ?? null,
        status: 'active',
        agency_id: agencyId,
      })}`
    } catch (err) {
      try { await sql`DELETE FROM user_profiles WHERE id = ${userId}` } catch {}
      return { error: `Failed to create admin record: ${err instanceof Error ? err.message : 'Unknown'}` }
    }
    const [agency] = await sql<{ agency_admin_ids: string[] | null }[]>`
      SELECT agency_admin_ids FROM agencies WHERE id = ${agencyId} LIMIT 1
    `
    const adminIds = (agency?.agency_admin_ids as string[] | null) ?? []
    await sql`UPDATE agencies SET agency_admin_ids = ${[...adminIds, userId]}, updated_at = ${new Date().toISOString()} WHERE id = ${agencyId}`
  }

  await sendInvitationEmail(normalizedEmail, fullName, tempPassword)
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

  const [current] = await sql<{ status: string }[]>`
    SELECT status FROM agency_admins WHERE id = ${adminId} AND agency_id = ${agencyId} LIMIT 1
  `

  try {
    await sql`UPDATE agency_admins SET status = ${status}, updated_at = ${new Date().toISOString()} WHERE id = ${adminId} AND agency_id = ${agencyId}`
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update status' }
  }

  await q.insertAuditLog({
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

  const [current] = await sql<{ status: string }[]>`
    SELECT status FROM caregiver_members WHERE id = ${caregiverId} AND agency_id = ${agencyId} LIMIT 1
  `

  try {
    await sql`UPDATE caregiver_members SET status = ${status}, updated_at = ${new Date().toISOString()} WHERE id = ${caregiverId} AND agency_id = ${agencyId}`
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update status' }
  }

  await q.insertAuditLog({
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

  const [current] = await sql<{ status: string }[]>`
    SELECT status FROM care_coordinators WHERE id = ${coordinatorId} AND agency_id = ${agencyId} LIMIT 1
  `

  try {
    await sql`UPDATE care_coordinators SET status = ${status}, updated_at = ${new Date().toISOString()} WHERE id = ${coordinatorId} AND agency_id = ${agencyId}`
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update status' }
  }

  await q.insertAuditLog({
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

  const result = await createUserForAgency(agencyId, 'staff_member', opts)
  if ('error' in result) return { error: result.error }

  await q.insertAuditLog({
    agency_id: agencyId,
    table_name: 'caregiver_members',
    record_id: result.userId,
    action: 'GRANT_SYSTEM_ACCESS',
    performed_by_user_id: session.user.id,
    details: { credential: 'staff_member' },
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

  const result = await createUserForAgency(agencyId, 'care_coordinator', opts)
  if ('error' in result) return { error: result.error }

  await q.insertAuditLog({
    agency_id: agencyId,
    table_name: 'care_coordinators',
    record_id: result.userId,
    action: 'GRANT_SYSTEM_ACCESS',
    performed_by_user_id: session.user.id,
    details: { credential: 'care_coordinator' },
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

  const result = await createUserForAgency(agencyId, 'company_owner', opts)
  if ('error' in result) return { error: result.error }

  await q.insertAuditLog({
    agency_id: agencyId,
    table_name: 'agency_admins',
    record_id: result.userId,
    action: 'GRANT_SYSTEM_ACCESS',
    performed_by_user_id: session.user.id,
    details: { credential: 'company_owner' },
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

  const [cg] = await sql<{ user_id: string | null }[]>`
    SELECT user_id FROM caregiver_members WHERE id = ${caregiverId} AND agency_id = ${agencyId} LIMIT 1
  `
  if (!cg) return { error: 'Caregiver not found' }

  try {
    await sql`UPDATE caregiver_members SET ${sql({
      first_name: updates.first_name,
      last_name: updates.last_name,
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.job_title !== undefined && { job_title: updates.job_title }),
      updated_at: new Date().toISOString(),
    })} WHERE id = ${caregiverId} AND agency_id = ${agencyId}`
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update caregiver' }
  }

  if (cg.user_id) {
    await sql`UPDATE user_profiles SET full_name = ${`${updates.first_name} ${updates.last_name}`}, updated_at = ${new Date().toISOString()} WHERE id = ${cg.user_id}`
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

  const [cc] = await sql<{ user_id: string | null }[]>`
    SELECT user_id FROM care_coordinators WHERE id = ${coordinatorId} AND agency_id = ${agencyId} LIMIT 1
  `
  if (!cc) return { error: 'Coordinator not found' }

  try {
    await sql`UPDATE care_coordinators SET ${sql({
      first_name: updates.first_name,
      last_name: updates.last_name,
      updated_at: new Date().toISOString(),
    })} WHERE id = ${coordinatorId} AND agency_id = ${agencyId}`
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update coordinator' }
  }

  if (cc.user_id) {
    await sql`UPDATE user_profiles SET full_name = ${`${updates.first_name} ${updates.last_name}`}, updated_at = ${new Date().toISOString()} WHERE id = ${cc.user_id}`
  }

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

  const [admin] = await sql<{ user_id: string | null }[]>`
    UPDATE agency_admins SET ${sql({
      contact_name: updates.contact_name,
      ...(updates.contact_phone !== undefined && { contact_phone: updates.contact_phone }),
      updated_at: new Date().toISOString(),
    })} WHERE id = ${adminId} AND agency_id = ${agencyId} RETURNING user_id
  `

  if (!admin) return { error: 'Agency admin not found' }

  if (admin.user_id) {
    await sql`UPDATE user_profiles SET full_name = ${updates.contact_name}, updated_at = ${new Date().toISOString()} WHERE id = ${admin.user_id}`
  }

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

  const normalizedEmail = opts.email.toLowerCase().trim()
  const fullName = `${opts.firstName} ${opts.lastName}`.trim()
  const userId = randomUUID()
  const passwordHash = await hashPassword(opts.tempPassword)

  try {
    await sql`INSERT INTO user_profiles ${sql({
      id: userId,
      email: normalizedEmail,
      role,
      full_name: fullName,
      password_hash: passwordHash,
      is_active: true,
      agency_id: agencyId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })}`
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create user profile' }
  }

  if (role === 'company_owner') {
    try {
      await sql`INSERT INTO agency_admins ${sql({
        user_id: userId,
        company_owner_id: userId,
        contact_name: fullName,
        contact_email: normalizedEmail,
        status: 'active',
        agency_id: agencyId,
      })}`
    } catch (err) {
      try { await sql`DELETE FROM user_profiles WHERE id = ${userId}` } catch {}
      return { error: `Failed to create admin record: ${err instanceof Error ? err.message : 'Unknown'}` }
    }
    const [agency] = await sql<{ agency_admin_ids: string[] | null }[]>`SELECT agency_admin_ids FROM agencies WHERE id = ${agencyId} LIMIT 1`
    const adminIds = (agency?.agency_admin_ids as string[] | null) ?? []
    await sql`UPDATE agencies SET agency_admin_ids = ${[...adminIds, userId]}, updated_at = ${new Date().toISOString()} WHERE id = ${agencyId}`
  } else {
    try {
      await sql`INSERT INTO care_coordinators ${sql({
        user_id: userId,
        agency_id: agencyId,
        first_name: opts.firstName,
        last_name: opts.lastName,
        email: normalizedEmail,
        status: 'active',
      })}`
    } catch (err) {
      try { await sql`DELETE FROM user_profiles WHERE id = ${userId}` } catch {}
      return { error: `Failed to create coordinator record: ${err instanceof Error ? err.message : 'Unknown'}` }
    }
  }

  await sendInvitationEmail(normalizedEmail, fullName, opts.tempPassword)

  try {
    await sql`UPDATE agency_key_staff SET user_profile_id = ${userId}, updated_at = ${new Date().toISOString()} WHERE id = ${keyStaffId} AND agency_id = ${agencyId}`
  } catch (err) {
    return { error: `User created but failed to link: ${err instanceof Error ? err.message : 'Unknown'}` }
  }

  await q.insertAuditLog({
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

  try {
    const [row] = await sql<{ change_person_credential: string | null }[]>`
      SELECT change_person_credential(
        ${agencyId}::uuid,
        ${opts.userProfileId}::uuid,
        ${opts.adminRecordId}::uuid,
        ${opts.coordinatorRecordId}::uuid,
        ${opts.toCredential}::text,
        ${opts.firstName}::text,
        ${opts.lastName}::text,
        ${opts.email}::text
      )
    `
    if (row?.change_person_credential) return { error: row.change_person_credential }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to change credential' }
  }

  await q.insertAuditLog({
    agency_id: agencyId,
    table_name: opts.toCredential === 'company_owner' ? 'agency_admins' : 'care_coordinators',
    record_id: opts.userProfileId,
    action: 'CHANGE_CREDENTIAL',
    performed_by_user_id: session.user.id,
    details: {
      to_credential: opts.toCredential,
      from_credential: opts.toCredential === 'company_owner' ? 'care_coordinator' : 'company_owner',
    },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}
