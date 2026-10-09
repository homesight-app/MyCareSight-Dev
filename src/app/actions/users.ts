'use server'

import { z } from 'zod'
import { randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import * as q from '@/lib/supabase/query'
import { getSession } from '@/lib/auth'
import { hashPassword } from '@/lib/auth/password'
import { clearLoginAccountFailures } from '@/lib/repositories/auth-identity'
import { setUserPasswordSchema, type SetUserPasswordFormData } from '@/lib/schemas/user'
import { zodErrorToFieldErrors } from '@/lib/validation'
import { sendInvitationEmail } from '@/lib/email'
import sql, { withUserContext } from '@/db'

const createUserAccountSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  role: z.enum(['admin', 'company_owner', 'staff_member', 'expert', 'care_coordinator']),
  agencyId: z.string().nullable().optional(),
})

const createAgencyAdminSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  contactEmail: z.string().email('Invalid email address'),
  contactPhone: z.string().default(''),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  workLocation: z.string().min(1, 'Work location is required'),
  status: z.enum(['active', 'inactive', 'pending']).default('active'),
})

const createStaffSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  agencyName: z.string().optional(),
})

export async function updatePersonalProfile(payload: {
  fullName: string
  phone: string | null
  jobTitle: string | null
  department: string | null
  workLocation: string | null
  startDate: string | null
}) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }

  const userId = session.user.id
  const role = session.profile?.role
  const now = new Date().toISOString()

  try {
    await sql`
      UPDATE user_profiles SET ${sql({
        full_name: payload.fullName,
        phone: payload.phone,
        job_title: payload.jobTitle,
        department: payload.department,
        work_location: payload.workLocation,
        start_date: payload.startDate,
        updated_at: now,
      })} WHERE id = ${userId}
    `

    const { first_name, last_name } = parseFullName(payload.fullName)
    if (role === 'company_owner') {
      await sql`UPDATE agency_admins SET ${sql({ contact_name: payload.fullName, contact_phone: payload.phone, updated_at: now })} WHERE user_id = ${userId}`
    } else if (role === 'care_coordinator') {
      await sql`UPDATE care_coordinators SET ${sql({ first_name, last_name, updated_at: now })} WHERE user_id = ${userId}`
    } else if (role === 'staff_member') {
      await sql`UPDATE caregiver_members SET ${sql({ first_name, last_name, phone: payload.phone, updated_at: now })} WHERE user_id = ${userId}`
    } else if (role === 'expert') {
      await sql`UPDATE licensing_experts SET ${sql({ first_name, last_name, updated_at: now })} WHERE user_id = ${userId}`
    }

    revalidatePath('/pages/agency/profile')
    revalidatePath('/pages/caregiver/profile')
    revalidatePath('/pages/expert/profile')
    return { error: null, data: { success: true } }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update profile', data: null }
  }
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden', data: null }

  try {
    const { error } = await q.updateUserProfileById(userId, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message, data: null }

    revalidatePath('/pages/admin/users')
    return { error: null, data: { success: true } }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update user status', data: null }
  }
}

const AGENCY_SCOPED_ROLES = new Set(['company_owner', 'staff_member', 'care_coordinator'])

export async function updateUserProfileAction(
  userId: string,
  payload: {
    fullName?: string
    email?: string
    role?: 'admin' | 'company_owner' | 'staff_member' | 'expert' | 'care_coordinator'
    agencyId?: string | null
  }
) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden', data: null }

  if (payload.role && session.user.id === userId) {
    return { error: 'You cannot change your own role.', data: null }
  }

  try {
    const result = await withUserContext(session.user.id, 'admin', null, async () => {
      const now = new Date().toISOString()
      const [current] = await sql<{
        id: string
        full_name: string | null
        email: string
        role: string
        agency_id: string | null
      }[]>`
        SELECT id, full_name, email, role, agency_id
        FROM user_profiles
        WHERE id = ${userId}
        LIMIT 1
        FOR UPDATE
      `
      if (!current) return { error: 'User not found', data: null }

      const newEmail = payload.email ? payload.email.toLowerCase().trim() : current.email
      const newFullName = payload.fullName !== undefined ? payload.fullName : current.full_name
      const newRole = payload.role ?? current.role
      const resolvedAgencyId = AGENCY_SCOPED_ROLES.has(newRole)
        ? (payload.agencyId !== undefined ? payload.agencyId : current.agency_id)
        : null

      if (newEmail !== current.email) {
        const [emailExists] = await sql<{ id: string }[]>`
          SELECT id FROM user_profiles WHERE lower(email) = lower(${newEmail}) AND id != ${userId} LIMIT 1
        `
        if (emailExists) return { error: 'A user with this email already exists.', data: null }
      }

      const updates: Record<string, unknown> = { updated_at: now }
      const changes: { field: string; old: string | null; new: string | null }[] = []

      if (newFullName !== current.full_name) {
        updates.full_name = newFullName
        changes.push({ field: 'full_name', old: current.full_name, new: newFullName })
      }
      if (newEmail !== current.email) {
        updates.email = newEmail
        updates.invite_token = null
        updates.invite_token_expires_at = null
        changes.push({ field: 'email', old: current.email, new: newEmail })
      }
      if (newRole !== current.role) {
        updates.role = newRole
        changes.push({ field: 'role', old: current.role, new: newRole })
      }
      if (resolvedAgencyId !== current.agency_id) {
        updates.agency_id = resolvedAgencyId
        changes.push({ field: 'agency_id', old: current.agency_id, new: resolvedAgencyId })
      }

      if (changes.length === 0) return { error: null, data: { success: true } }

      let agencyDisplayName: string | null = null
      if (newRole === 'company_owner' && resolvedAgencyId) {
        const [agencyRow] = await sql<{ name: string }[]>`
          SELECT name FROM agencies WHERE id = ${resolvedAgencyId} LIMIT 1
        `
        agencyDisplayName = agencyRow?.name ?? null
      }

      await sql`UPDATE user_profiles SET ${sql(updates)} WHERE id = ${userId}`

      const needsRoleTableSync = changes.some(change =>
        ['full_name', 'email', 'role', 'agency_id'].includes(change.field)
      )
      if (needsRoleTableSync) {
        await syncUserDomainRoleRow({
          userId,
          fullName: newFullName ?? '',
          email: newEmail,
          role: newRole,
          agencyId: resolvedAgencyId,
          agencyDisplayName,
          updatedAt: now,
        })
      }

      const roleChange = changes.find(change => change.field === 'role')
      const agencyChange = changes.find(change => change.field === 'agency_id')
      const { error: auditErr } = await q.insertAuditLog({
        table_name: 'user_profiles',
        record_id: userId,
        action: 'UPDATE',
        performed_by_user_id: session.user.id,
        agency_id: resolvedAgencyId,
        details: {
          changed_fields: changes.map(change => change.field),
          ...(roleChange ? { old_role: roleChange.old, new_role: roleChange.new } : {}),
          ...(agencyChange ? { agency_changed: true } : {}),
        },
      })
      if (auditErr) throw auditErr

      return { error: null, data: { success: true } }
    })

    if (result.error) return result

    revalidatePath('/pages/admin/users')
    revalidatePath('/pages/agency/profile')
    revalidatePath('/pages/caregiver/profile')
    revalidatePath('/pages/expert/profile')
    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update user', data: null }
  }
}

type SetUserPasswordResult =
  | { success: true; message: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function setUserPassword(
  userId: string,
  input: SetUserPasswordFormData,
  agencyId?: string
): Promise<SetUserPasswordResult> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Forbidden' }

  const actorRole = session.profile?.role ?? ''
  const isPlatformAdmin = actorRole === 'admin'
  const isAgencyManager = actorRole === 'company_owner' || actorRole === 'care_coordinator'
  const agencyIdResult = agencyId ? z.string().uuid().safeParse(agencyId) : null
  const authorizedAgencyId = agencyIdResult?.success ? agencyIdResult.data : null

  if (!isPlatformAdmin) {
    const managesAgency = isAgencyManager && authorizedAgencyId && session.agencyRoles?.some(membership =>
      membership.agency_id === authorizedAgencyId
      && (membership.role === 'company_owner' || membership.role === 'care_coordinator')
      && membership.status === 'active'
    )
    if (!managesAgency) return { success: false, error: 'Forbidden' }
  }

  const idResult = z.string().uuid().safeParse(userId)
  if (!idResult.success) return { success: false, error: 'User not found' }

  const parsed = setUserPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Check the highlighted fields.',
      fieldErrors: zodErrorToFieldErrors(parsed.error),
    }
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password)
    return await withUserContext(
      session.user.id,
      actorRole,
      isPlatformAdmin ? null : authorizedAgencyId,
      async () => {
      type PasswordTarget = {
        id: string
        email: string
        role: string
        agency_id: string | null
        is_active: boolean
      }
      const [userProfile] = isPlatformAdmin
        ? await sql<PasswordTarget[]>`
            SELECT id, email, role, agency_id, is_active
            FROM user_profiles
            WHERE id = ${idResult.data}
            LIMIT 1
            FOR UPDATE
          `
        : await sql<PasswordTarget[]>`
            SELECT id, email, role, agency_id, is_active
            FROM user_profiles
            WHERE id = ${idResult.data}
              AND agency_id = ${authorizedAgencyId}
              AND role IN ('company_owner', 'care_coordinator', 'staff_member')
            LIMIT 1
            FOR UPDATE
          `
      if (!userProfile) return { success: false, error: 'User not found' }
      if (!userProfile.is_active) {
        return { success: false, error: 'Activate this account before setting a login password.' }
      }

      const [emailState] = await sql<{ profile_count: number }[]>`
        SELECT count(*)::int AS profile_count
        FROM user_profiles
        WHERE lower(email) = lower(${userProfile.email})
      `
      if ((emailState?.profile_count ?? 0) !== 1) {
        return {
          success: false,
          error: 'This email is assigned to multiple accounts. Resolve the duplicate accounts before setting a password.',
        }
      }

      if (['company_owner', 'care_coordinator', 'staff_member'].includes(userProfile.role)) {
        const [membership] = await sql<{ allows_login: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM user_agency_roles
            WHERE user_id = ${userProfile.id}
              AND agency_id = ${userProfile.agency_id}
              AND role = ${userProfile.role}
              AND status = 'active'
          ) AS allows_login
        `
        if (!membership?.allows_login) {
          return {
            success: false,
            error: 'This account does not have an active matching agency membership. Correct its role and agency access before setting a password.',
          }
        }
      }

      await sql`
        UPDATE user_profiles
        SET password_hash = ${passwordHash},
            invite_token = NULL,
            invite_token_expires_at = NULL,
            updated_at = now()
        WHERE id = ${userProfile.id}
      `
      await sql`
        UPDATE password_reset_tokens
        SET used_at = now()
        WHERE user_id = ${userProfile.id}
          AND used_at IS NULL
      `
      await clearLoginAccountFailures(userProfile.email)
      await sql`
        INSERT INTO audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${userProfile.agency_id}, 'user_profiles', ${userProfile.id},
          'PASSWORD_RESET', ${session.user.id}, '{"method":"administrator"}'::jsonb
        )
      `

      revalidatePath('/pages/admin/users')
      revalidatePath('/pages/agency/user-management')
      return {
        success: true,
        message: 'Password updated. The user can sign in immediately with the new password.',
      }
    })
  } catch {
    return { success: false, error: 'Failed to set password. Please try again.' }
  }
}

export type CreateUserRole = 'admin' | 'company_owner' | 'staff_member' | 'expert' | 'care_coordinator'

async function rollbackProvisionalUserAccount(
  userId: string,
  options?: { agencyId?: string; agencyAdminIdToUnlink?: string }
) {
  try {
    if (options?.agencyId && options?.agencyAdminIdToUnlink) {
      const [agency] = await sql<{ agency_admin_ids: string[] | null }[]>`
        SELECT agency_admin_ids FROM agencies WHERE id = ${options.agencyId} LIMIT 1
      `
      const raw = agency?.agency_admin_ids
      if (Array.isArray(raw) && raw.includes(options.agencyAdminIdToUnlink)) {
        const filtered = raw.filter(id => id !== options.agencyAdminIdToUnlink)
        await sql`UPDATE agencies SET agency_admin_ids = ${filtered}, updated_at = ${new Date().toISOString()} WHERE id = ${options.agencyId}`
      }
    }
    await sql`DELETE FROM agency_admins WHERE user_id = ${userId}`
    await sql`DELETE FROM caregiver_members WHERE user_id = ${userId}`
    await sql`DELETE FROM licensing_experts WHERE user_id = ${userId}`
    await sql`DELETE FROM care_coordinators WHERE user_id = ${userId}`
    await sql`DELETE FROM user_profiles WHERE id = ${userId}`
  } catch (e: unknown) {
    console.error('rollbackProvisionalUserAccount: unexpected error', e)
  }
}

function parseFullName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim()
  if (!trimmed) return { first_name: 'User', last_name: 'Unknown' }
  const space = trimmed.indexOf(' ')
  if (space <= 0) return { first_name: trimmed, last_name: 'Unknown' }
  return {
    first_name: trimmed.slice(0, space),
    last_name: trimmed.slice(space + 1).trim() || 'Unknown',
  }
}

async function syncUserDomainRoleRow(input: {
  userId: string
  fullName: string
  email: string
  role: string
  agencyId: string | null
  agencyDisplayName: string | null
  updatedAt: string
}) {
  const { first_name, last_name } = parseFullName(input.fullName)

  if (input.role === 'company_owner') {
    const updated = await sql<{ id: string }[]>`
      UPDATE agency_admins
      SET ${sql({
        contact_name: input.fullName,
        contact_email: input.email,
        agency_id: input.agencyId,
        ...(input.agencyDisplayName ? { company_name: input.agencyDisplayName } : {}),
        updated_at: input.updatedAt,
      })}
      WHERE user_id = ${input.userId}
      RETURNING id
    `
    if (updated.length === 0) {
      await sql`
        INSERT INTO agency_admins ${sql({
          user_id: input.userId,
          company_owner_id: input.userId,
          agency_id: input.agencyId,
          company_name: input.agencyDisplayName,
          contact_name: input.fullName || input.email,
          contact_email: input.email,
          status: 'pending',
          updated_at: input.updatedAt,
        })}
      `
    }
    return
  }

  if (input.role === 'care_coordinator') {
    if (!input.agencyId) throw new Error('Agency is required for care coordinator role.')
    const updated = await sql<{ id: string }[]>`
      UPDATE care_coordinators
      SET ${sql({
        first_name,
        last_name,
        email: input.email,
        agency_id: input.agencyId,
        updated_at: input.updatedAt,
      })}
      WHERE user_id = ${input.userId}
      RETURNING id
    `
    if (updated.length === 0) {
      await sql`
        INSERT INTO care_coordinators ${sql({
          user_id: input.userId,
          agency_id: input.agencyId,
          first_name,
          last_name,
          email: input.email,
          status: 'active',
          updated_at: input.updatedAt,
        })}
      `
    }
    return
  }

  if (input.role === 'staff_member') {
    const updated = await sql<{ id: string }[]>`
      UPDATE caregiver_members
      SET ${sql({
        first_name,
        last_name,
        email: input.email,
        agency_id: input.agencyId,
        updated_at: input.updatedAt,
      })}
      WHERE user_id = ${input.userId}
      RETURNING id
    `
    if (updated.length === 0) {
      await sql`
        INSERT INTO caregiver_members ${sql({
          user_id: input.userId,
          company_owner_id: null,
          agency_id: input.agencyId,
          first_name,
          last_name,
          email: input.email,
          role: 'Caregiver',
          status: 'active',
          updated_at: input.updatedAt,
        })}
      `
    }
    return
  }

  if (input.role === 'expert') {
    const updated = await sql<{ id: string }[]>`
      UPDATE licensing_experts
      SET ${sql({
        first_name,
        last_name,
        email: input.email,
        updated_at: input.updatedAt,
      })}
      WHERE user_id = ${input.userId}
      RETURNING id
    `
    if (updated.length === 0) {
      await sql`
        INSERT INTO licensing_experts ${sql({
          user_id: input.userId,
          user_profile_id: input.userId,
          first_name,
          last_name,
          email: input.email,
          role: 'Licensing Specialist',
          status: 'active',
          updated_at: input.updatedAt,
        })}
      `
    }
  }
}

async function ensureRoleTableRow(
  userId: string,
  fullName: string,
  normalizedEmail: string,
  role: CreateUserRole
) {
  const { first_name: firstName, last_name: lastName } = parseFullName(fullName)
  if (role === 'company_owner') {
    const { data: existing } = await q.getClientByCompanyOwnerId(userId)
    if (!existing) {
      await q.insertClient({
        user_id: userId,
        contact_name: fullName || normalizedEmail,
        contact_email: normalizedEmail,
        status: 'pending',
      })
    }
  } else if (role === 'staff_member') {
    const { data: existing } = await q.getStaffMemberByUserId(userId)
    if (!existing) {
      await q.insertStaffMember({
        user_id: userId,
        company_owner_id: null,
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        role: 'Caregiver',
        status: 'active',
      })
    }
  } else if (role === 'expert') {
    const { data: existing } = await q.getLicensingExpertIdByUserId(userId)
    if (!existing) {
      await q.insertLicensingExpert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        role: 'Licensing Specialist',
        status: 'active',
      })
    }
  }
}

export async function createUserAccount(
  email: string,
  password: string,
  fullName: string,
  role: CreateUserRole,
  agencyId?: string | null
) {
  const inputParsed = createUserAccountSchema.safeParse({ email, password, fullName, role, agencyId })
  if (!inputParsed.success) return { error: inputParsed.error.issues[0]?.message ?? 'Invalid input', data: null }

  const normalizedEmail = email.toLowerCase().trim()
  const fullNameTrimmed = fullName.trim()

  if (role === 'care_coordinator' && !agencyId) {
    return { error: 'Agency is required for care coordinator role.', data: null }
  }

  let provisionalUserId: string | null = null
  let setupCompleted = false

  try {
    const { data: existingProfile } = await q.getUserProfileByEmail(normalizedEmail)

    if (existingProfile) {
      const passwordHash = await hashPassword(password)
      await sql`
        UPDATE user_profiles SET password_hash = ${passwordHash}, role = ${role}, agency_id = ${agencyId ?? null}, updated_at = ${new Date().toISOString()}
        WHERE id = ${existingProfile.id}
      `
      await ensureRoleTableRow(existingProfile.id, fullNameTrimmed, normalizedEmail, role)
      await sendInvitationEmail(normalizedEmail, fullNameTrimmed, password)
      revalidatePath('/pages/admin/users')
      return {
        error: null,
        data: { success: true, userId: existingProfile.id, message: `User already exists. Invitation re-sent to ${email}.` },
      }
    }

    const userId = randomUUID()
    provisionalUserId = userId
    const passwordHash = await hashPassword(password)

    await sql`INSERT INTO user_profiles ${sql({
      id: userId,
      email: normalizedEmail,
      role,
      full_name: fullNameTrimmed,
      password_hash: passwordHash,
      is_active: true,
      agency_id: agencyId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })}`

    const { first_name: firstName, last_name: lastName } = parseFullName(fullNameTrimmed)

    if (role === 'company_owner') {
      const [newAdmin] = await sql<{ id: string }[]>`
        INSERT INTO agency_admins ${sql({
          user_id: userId,
          company_owner_id: userId,
          contact_name: fullNameTrimmed || normalizedEmail,
          contact_email: normalizedEmail,
          status: 'pending',
          agency_id: agencyId ?? null,
        })} RETURNING id
      `
      if (agencyId && newAdmin?.id) {
        const [agency] = await sql<{ agency_admin_ids: string[] | null }[]>`
          SELECT agency_admin_ids FROM agencies WHERE id = ${agencyId} LIMIT 1
        `
        const currentIds = (agency?.agency_admin_ids as string[] | null) || []
        if (!currentIds.includes(newAdmin.id)) {
          await sql`UPDATE agencies SET agency_admin_ids = ${[...currentIds, newAdmin.id]}, updated_at = ${new Date().toISOString()} WHERE id = ${agencyId}`
        }
      }
    } else if (role === 'staff_member') {
      let companyOwnerId: string | null = null
      if (agencyId) {
        const [agency] = await sql<{ agency_admin_ids: string[] | null }[]>`SELECT agency_admin_ids FROM agencies WHERE id = ${agencyId} LIMIT 1`
        const adminIds = (agency?.agency_admin_ids as string[] | null) || []
        if (adminIds.length > 0) companyOwnerId = adminIds[0]
      }
      await sql`INSERT INTO caregiver_members ${sql({
        user_id: userId,
        company_owner_id: companyOwnerId,
        agency_id: agencyId || null,
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        role: 'Caregiver',
        status: 'active',
      })}`
    } else if (role === 'expert') {
      await sql`INSERT INTO licensing_experts ${sql({
        user_id: userId,
        user_profile_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        role: 'Licensing Specialist',
        status: 'active',
      })}`
    } else if (role === 'care_coordinator') {
      const { error: coordinatorError } = await q.insertCareCoordinator({
        user_id: userId,
        agency_id: agencyId!,
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        status: 'active',
      })
      if (coordinatorError) throw new Error(`Failed to create care coordinator record: ${coordinatorError.message}`)
    }

    setupCompleted = true
    provisionalUserId = null

    await sendInvitationEmail(normalizedEmail, fullNameTrimmed, password)

    revalidatePath('/pages/admin/users')
    return {
      error: null,
      data: { success: true, userId, message: `User created. Invitation email sent to ${email}.` },
    }
  } catch (err: unknown) {
    if (!setupCompleted && provisionalUserId) {
      await rollbackProvisionalUserAccount(provisionalUserId)
    }
    return { error: err instanceof Error ? err.message : 'Failed to create user account', data: null }
  }
}

export async function createAgencyAdminAccount(
  firstName: string,
  lastName: string,
  contactEmail: string,
  contactPhone: string,
  jobTitle: string | undefined,
  department: string | undefined,
  workLocation: string,
  status: 'active' | 'inactive' | 'pending' = 'active'
) {
  const inputParsed = createAgencyAdminSchema.safeParse({ firstName, lastName, contactEmail, contactPhone, jobTitle, department, workLocation, status })
  if (!inputParsed.success) return { error: inputParsed.error.issues[0]?.message ?? 'Invalid input', data: null }

  const normalizedEmail = contactEmail.toLowerCase().trim()
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || normalizedEmail
  const tempPassword = randomBytes(12).toString('base64')

  try {
    const [existingProfile] = await sql<{ id: string }[]>`SELECT id FROM user_profiles WHERE email = ${normalizedEmail} LIMIT 1`

    if (existingProfile) {
      const [existingAdmin] = await sql<{ id: string }[]>`SELECT id FROM agency_admins WHERE user_id = ${existingProfile.id} LIMIT 1`
      if (!existingAdmin) {
        await sql`INSERT INTO agency_admins ${sql({
          user_id: existingProfile.id,
          company_owner_id: existingProfile.id,
          contact_name: fullName,
          contact_email: normalizedEmail,
          contact_phone: contactPhone.trim() || null,
          status,
          agency_id: null,
        })}`
      }
      const passwordHash = await hashPassword(tempPassword)
      await sql`UPDATE user_profiles SET password_hash = ${passwordHash}, updated_at = ${new Date().toISOString()} WHERE id = ${existingProfile.id}`
      await sendInvitationEmail(normalizedEmail, fullName, tempPassword)
      revalidatePath('/pages/admin/users')
      return {
        error: null,
        data: { success: true, userId: existingProfile.id, message: `User already exists. Invitation re-sent to ${contactEmail}.` },
      }
    }

    const userId = randomUUID()
    const passwordHash = await hashPassword(tempPassword)

    await sql`INSERT INTO user_profiles ${sql({
      id: userId,
      email: normalizedEmail,
      role: 'company_owner',
      full_name: fullName,
      password_hash: passwordHash,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })}`

    try {
      await sql`INSERT INTO agency_admins ${sql({
        user_id: userId,
        company_owner_id: userId,
        contact_name: fullName,
        contact_email: normalizedEmail,
        contact_phone: contactPhone.trim() || null,
        status,
        agency_id: null,
      })}`
    } catch (adminErr) {
      console.error('Failed to create agency_admins row for agency admin:', adminErr)
      try { await sql`DELETE FROM user_profiles WHERE id = ${userId}` } catch {}
      const msg = adminErr instanceof Error ? adminErr.message : 'Unknown error'
      return { error: `User created but failed to create agency record: ${msg}`, data: null }
    }

    await sendInvitationEmail(normalizedEmail, fullName, tempPassword)

    revalidatePath('/pages/admin/users')
    return {
      error: null,
      data: { success: true, userId, message: `Agency admin created. Invitation email sent to ${contactEmail}.` },
    }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create agency admin account', data: null }
  }
}

export async function createStaffUserAccount(
  email: string,
  firstName: string,
  lastName: string,
  agencyName?: string
) {
  const inputParsed = createStaffSchema.safeParse({ email, firstName, lastName, agencyName })
  if (!inputParsed.success) return { error: inputParsed.error.issues[0]?.message ?? 'Invalid input', data: null }

  const normalizedEmail = email.toLowerCase().trim()
  const fullName = `${firstName} ${lastName}`.trim()
  const tempPassword = randomBytes(12).toString('base64')

  try {
    const [existingProfile] = await sql<{ id: string }[]>`SELECT id FROM user_profiles WHERE email = ${normalizedEmail} LIMIT 1`

    if (existingProfile) {
      const passwordHash = await hashPassword(tempPassword)
      await sql`UPDATE user_profiles SET password_hash = ${passwordHash}, updated_at = ${new Date().toISOString()} WHERE id = ${existingProfile.id}`
      await sendInvitationEmail(normalizedEmail, fullName, tempPassword, agencyName)
      return {
        error: null,
        data: { success: true, userId: existingProfile.id, message: `User already exists. Invitation re-sent to ${email}.` },
      }
    }

    const userId = randomUUID()
    const passwordHash = await hashPassword(tempPassword)

    await sql`INSERT INTO user_profiles ${sql({
      id: userId,
      email: normalizedEmail,
      role: 'staff_member',
      full_name: fullName,
      password_hash: passwordHash,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })}`

    await sendInvitationEmail(normalizedEmail, fullName, tempPassword, agencyName)

    return {
      error: null,
      data: { success: true, userId, message: `User account created. Invitation email sent to ${email}.` },
    }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create user account', data: null }
  }
}
