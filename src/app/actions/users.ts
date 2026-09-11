'use server'

import { z } from 'zod'
import { randomBytes, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import * as q from '@/lib/supabase/query'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { sendInvitationEmail } from '@/lib/email'

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
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  try {
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        full_name: payload.fullName,
        phone: payload.phone,
        job_title: payload.jobTitle,
        department: payload.department,
        work_location: payload.workLocation,
        start_date: payload.startDate,
        updated_at: now,
      })
      .eq('id', userId)
    if (profileError) return { error: profileError.message, data: null }

    // Sync name/phone to the role table so the People/Caregivers tabs
    // never show a stale name after a user edits their own profile.
    const { first_name, last_name } = parseFullName(payload.fullName)
    if (role === 'company_owner') {
      await supabase
        .from('agency_admins')
        .update({ contact_name: payload.fullName, contact_phone: payload.phone, updated_at: now })
        .eq('user_id', userId)
    } else if (role === 'care_coordinator') {
      await supabase
        .from('care_coordinators')
        .update({ first_name, last_name, updated_at: now })
        .eq('user_id', userId)
    } else if (role === 'staff_member') {
      await supabase
        .from('caregiver_members')
        .update({ first_name, last_name, phone: payload.phone, updated_at: now })
        .eq('user_id', userId)
    } else if (role === 'expert') {
      await supabase
        .from('licensing_experts')
        .update({ first_name, last_name, updated_at: now })
        .eq('user_id', userId)
    }

    revalidatePath('/pages/agency/profile')
    revalidatePath('/pages/caregiver/profile')
    revalidatePath('/pages/expert/profile')
    return { error: null, data: { success: true } }
  } catch (err: any) {
    return { error: err?.message || 'Failed to update profile', data: null }
  }
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden', data: null }

  const supabase = createAdminClient()

  try {
    const { error } = await q.updateUserProfileById(supabase, userId, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      return { error: error.message, data: null }
    }

    revalidatePath('/pages/admin/users')
    return { error: null, data: { success: true } }
  } catch (err: any) {
    return { error: err.message || 'Failed to update user status', data: null }
  }
}

const AGENCY_SCOPED_ROLES = new Set(['company_owner', 'staff_member', 'care_coordinator'])

/** Edit any user's full name, email, role, and/or agency — admin only.
 *  Self-role-change is blocked server-side; self name/email edit is permitted.
 *  All changed fields are recorded in audit_log with before/after values.
 *  Email change clears any pending invite_token so old reset links cannot be reused.
 *  Name/email/agency changes are propagated to the role-specific table.
 *  Role changes trigger ensureRoleTableRow for company_owner, staff_member, expert.
 */
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

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data: current } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role, agency_id')
    .eq('id', userId)
    .single()
  if (!current) return { error: 'User not found', data: null }

  const newEmail = payload.email ? payload.email.toLowerCase().trim() : current.email
  const newFullName = payload.fullName !== undefined ? payload.fullName : current.full_name
  const newRole = payload.role ?? current.role

  // agencyId is only meaningful for agency-scoped roles; clear it for admin/expert
  const resolvedAgencyId = AGENCY_SCOPED_ROLES.has(newRole)
    ? (payload.agencyId !== undefined ? payload.agencyId : current.agency_id)
    : null

  if (newEmail !== current.email) {
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', newEmail)
      .maybeSingle()
    if (existing) return { error: 'A user with this email already exists.', data: null }
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

  const { error } = await supabase.from('user_profiles').update(updates).eq('id', userId)
  if (error) return { error: error.message, data: null }

  // Sync name, email, and agency_id to the role-specific table.
  const { first_name, last_name } = parseFullName(newFullName ?? '')
  const needsRoleTableSync = changes.some(
    c => c.field === 'full_name' || c.field === 'email' || c.field === 'agency_id'
  )
  // For company_owner, also sync the agency's display name into agency_admins.company_name
  // so the admin User Management table shows the correct company in the Company column.
  let agencyDisplayName: string | null = null
  if (newRole === 'company_owner' && resolvedAgencyId) {
    const { data: agencyRow } = await supabase
      .from('agencies')
      .select('name')
      .eq('id', resolvedAgencyId)
      .maybeSingle()
    agencyDisplayName = agencyRow?.name ?? null
  }

  if (needsRoleTableSync) {
    if (newRole === 'company_owner') {
      await supabase
        .from('agency_admins')
        .update({
          contact_name: newFullName,
          contact_email: newEmail,
          agency_id: resolvedAgencyId,
          ...(agencyDisplayName ? { company_name: agencyDisplayName } : {}),
          updated_at: now,
        })
        .eq('user_id', userId)
    } else if (newRole === 'care_coordinator') {
      await supabase
        .from('care_coordinators')
        .update({ first_name, last_name, email: newEmail, agency_id: resolvedAgencyId, updated_at: now })
        .eq('user_id', userId)
    } else if (newRole === 'staff_member') {
      await supabase
        .from('caregiver_members')
        .update({ first_name, last_name, email: newEmail, agency_id: resolvedAgencyId, updated_at: now })
        .eq('user_id', userId)
    } else if (newRole === 'expert') {
      await supabase
        .from('licensing_experts')
        .update({ first_name, last_name, email: newEmail, updated_at: now })
        .eq('user_id', userId)
    }
  }

  // Idempotently create the new role's table row when role changes.
  // care_coordinator is handled inline below (needs agency_id).
  // admin has no role table.
  if (changes.some(c => c.field === 'role')) {
    if (newRole === 'company_owner' || newRole === 'staff_member' || newRole === 'expert') {
      await ensureRoleTableRow(supabase, userId, newFullName ?? '', newEmail, newRole)
      // If a new agency_admins row was just created by ensureRoleTableRow, patch company_name onto it.
      if (newRole === 'company_owner' && agencyDisplayName) {
        await supabase
          .from('agency_admins')
          .update({ company_name: agencyDisplayName, agency_id: resolvedAgencyId, updated_at: now })
          .eq('user_id', userId)
      }
    } else if (newRole === 'care_coordinator' && resolvedAgencyId) {
      const { data: existingCoord } = await supabase
        .from('care_coordinators')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()
      if (!existingCoord) {
        await q.insertCareCoordinator(supabase, {
          user_id: userId,
          agency_id: resolvedAgencyId,
          first_name,
          last_name,
          email: newEmail,
          status: 'active',
        })
      }
    }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    table_name: 'user_profiles',
    record_id: userId,
    action: 'UPDATE',
    performed_by_user_id: session.user.id,
    details: { changes, affected_user_email: current.email },
  })
  if (auditErr) console.error('[updateUserProfileAction] Audit log failed:', auditErr.message)

  revalidatePath('/pages/admin/users')
  revalidatePath('/pages/agency/profile')
  revalidatePath('/pages/caregiver/profile')
  revalidatePath('/pages/expert/profile')
  return { error: null, data: { success: true } }
}

/** Set (or reset) a user's password directly — admin only. */
export async function setUserPassword(userId: string, newPassword: string) {
  const session = await getSession()
  if (!session || session.profile?.role !== 'admin') return { error: 'Forbidden', data: null }

  const supabase = createAdminClient()
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('id', userId)
    .single()

  if (!userProfile) return { error: 'User not found', data: null }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  const { error } = await supabase
    .from('user_profiles')
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return { error: error.message, data: null }

  revalidatePath('/pages/admin/users')
  return {
    error: null,
    data: { success: true, message: `Password has been set for ${userProfile.email}.` },
  }
}

/** Role value for new users created from admin User Management */
export type CreateUserRole = 'admin' | 'company_owner' | 'staff_member' | 'expert' | 'care_coordinator'

type SupabaseAdminClient = ReturnType<typeof createAdminClient>

/**
 * Best-effort undo after user_profiles was inserted but app-specific setup failed.
 * Order: unlink from agencies → role tables → user_profiles
 */
async function rollbackProvisionalUserAccount(
  admin: SupabaseAdminClient,
  userId: string,
  options?: { agencyId?: string; agencyAdminIdToUnlink?: string }
) {
  try {
    if (options?.agencyId && options?.agencyAdminIdToUnlink) {
      const { data: agency } = await admin.from('agencies').select('agency_admin_ids').eq('id', options.agencyId).maybeSingle()
      const raw = agency?.agency_admin_ids as string[] | null | undefined
      if (Array.isArray(raw) && raw.includes(options.agencyAdminIdToUnlink)) {
        const filtered = raw.filter((id) => id !== options.agencyAdminIdToUnlink)
        await admin
          .from('agencies')
          .update({ agency_admin_ids: filtered, updated_at: new Date().toISOString() })
          .eq('id', options.agencyId)
      }
    }
    await admin.from('agency_admins').delete().eq('user_id', userId)
    await admin.from('caregiver_members').delete().eq('user_id', userId)
    await admin.from('licensing_experts').delete().eq('user_id', userId)
    await admin.from('care_coordinators').delete().eq('user_id', userId)
    await admin.from('user_profiles').delete().eq('id', userId)
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

/** Ensure the role-specific table has a row for this user (idempotent). Used when user already exists. */
async function ensureRoleTableRow(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  userId: string,
  fullName: string,
  normalizedEmail: string,
  role: CreateUserRole
) {
  const { first_name: firstName, last_name: lastName } = parseFullName(fullName)
  if (role === 'company_owner') {
    const { data: existing } = await q.getClientByCompanyOwnerId(supabaseAdmin, userId)
    if (!existing) {
      await q.insertClient(supabaseAdmin, {
        user_id: userId,
        contact_name: fullName || normalizedEmail,
        contact_email: normalizedEmail,
        status: 'pending',
      })
    }
  } else if (role === 'staff_member') {
    const { data: existing } = await q.getStaffMemberByUserId(supabaseAdmin, userId)
    if (!existing) {
      await q.insertStaffMember(supabaseAdmin, {
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
    const { data: existing } = await q.getLicensingExpertIdByUserId(supabaseAdmin, userId)
    if (!existing) {
      await q.insertLicensingExpert(supabaseAdmin, {
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

/**
 * Create a user account from admin User Management.
 * Inserts directly into user_profiles with a bcrypt password hash and sends an invitation email.
 * When role is company_owner, staff_member, or care_coordinator, agencyId is required.
 */
export async function createUserAccount(
  email: string,
  password: string,
  fullName: string,
  role: CreateUserRole,
  agencyId?: string | null
) {
  const inputParsed = createUserAccountSchema.safeParse({ email, password, fullName, role, agencyId })
  if (!inputParsed.success) return { error: inputParsed.error.issues[0]?.message ?? 'Invalid input', data: null }

  const supabaseAdmin = createAdminClient()
  const normalizedEmail = email.toLowerCase().trim()
  const fullNameTrimmed = fullName.trim()

  if (role === 'care_coordinator' && !agencyId) {
    return { error: 'Agency is required for care coordinator role.', data: null }
  }

  let provisionalUserId: string | null = null
  let setupCompleted = false

  try {
    // Check for existing user
    const { data: existingProfile } = await q.getUserProfileByEmail(supabaseAdmin, normalizedEmail)

    if (existingProfile) {
      const passwordHash = await bcrypt.hash(password, 12)
      await supabaseAdmin
        .from('user_profiles')
        .update({ password_hash: passwordHash, role, agency_id: agencyId ?? null, updated_at: new Date().toISOString() })
        .eq('id', existingProfile.id)
      await ensureRoleTableRow(supabaseAdmin, existingProfile.id, fullNameTrimmed, normalizedEmail, role)
      await sendInvitationEmail(normalizedEmail, fullNameTrimmed, password)
      revalidatePath('/pages/admin/users')
      return {
        error: null,
        data: { success: true, userId: existingProfile.id, message: `User already exists. Invitation re-sent to ${email}.` },
      }
    }

    // New user — insert directly into user_profiles
    const userId = randomUUID()
    provisionalUserId = userId
    const passwordHash = await bcrypt.hash(password, 12)

    const { error: insertError } = await supabaseAdmin.from('user_profiles').insert({
      id: userId,
      email: normalizedEmail,
      role,
      full_name: fullNameTrimmed,
      password_hash: passwordHash,
      is_active: true,
      agency_id: agencyId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (insertError) {
      return { error: `Failed to create user: ${insertError.message}`, data: null }
    }

    // Insert into role-specific table
    const { first_name: firstName, last_name: lastName } = parseFullName(fullNameTrimmed)

    if (role === 'company_owner') {
      const { data: newAdmin, error: adminError } = await supabaseAdmin
        .from('agency_admins')
        .insert({
          user_id: userId,
          company_owner_id: userId,
          contact_name: fullNameTrimmed || normalizedEmail,
          contact_email: normalizedEmail,
          status: 'pending',
          agency_id: agencyId ?? null,
        })
        .select('id')
        .single()
      if (adminError) {
        await rollbackProvisionalUserAccount(supabaseAdmin, userId)
        provisionalUserId = null
        return { error: `Failed to create agency record: ${adminError.message}`, data: null }
      }
      if (agencyId && newAdmin?.id) {
        const { data: agency, error: agencySelErr } = await supabaseAdmin
          .from('agencies')
          .select('agency_admin_ids')
          .eq('id', agencyId)
          .maybeSingle()
        if (agencySelErr) {
          await rollbackProvisionalUserAccount(supabaseAdmin, userId)
          provisionalUserId = null
          return { error: `Failed to load agency for linking: ${agencySelErr.message}`, data: null }
        }
        const currentIds = (agency?.agency_admin_ids as string[] | null) || []
        if (!currentIds.includes(newAdmin.id)) {
          const { error: agencyUpdErr } = await supabaseAdmin
            .from('agencies')
            .update({ agency_admin_ids: [...currentIds, newAdmin.id], updated_at: new Date().toISOString() })
            .eq('id', agencyId)
          if (agencyUpdErr) {
            await rollbackProvisionalUserAccount(supabaseAdmin, userId, {
              agencyId,
              agencyAdminIdToUnlink: newAdmin.id,
            })
            provisionalUserId = null
            return { error: `Failed to link agency admin to agency: ${agencyUpdErr.message}`, data: null }
          }
        }
      }
    } else if (role === 'staff_member') {
      let companyOwnerId: string | null = null
      if (agencyId) {
        const { data: agency } = await supabaseAdmin.from('agencies').select('agency_admin_ids').eq('id', agencyId).single()
        const adminIds = (agency?.agency_admin_ids as string[] | null) || []
        if (adminIds.length > 0) companyOwnerId = adminIds[0]
      }
      const { error: staffError } = await supabaseAdmin
        .from('caregiver_members')
        .insert({
          user_id: userId,
          company_owner_id: companyOwnerId,
          agency_id: agencyId || null,
          first_name: firstName,
          last_name: lastName,
          email: normalizedEmail,
          role: 'Caregiver',
          status: 'active',
        })
      if (staffError) {
        await rollbackProvisionalUserAccount(supabaseAdmin, userId)
        provisionalUserId = null
        return { error: `Failed to create staff record: ${staffError.message}`, data: null }
      }
    } else if (role === 'expert') {
      const { error: expertError } = await supabaseAdmin
        .from('licensing_experts')
        .insert({
          user_id: userId,
          user_profile_id: userId,
          first_name: firstName,
          last_name: lastName,
          email: normalizedEmail,
          role: 'Licensing Specialist',
          status: 'active',
        })
      if (expertError) {
        await rollbackProvisionalUserAccount(supabaseAdmin, userId)
        provisionalUserId = null
        return { error: `Failed to create expert record: ${expertError.message}`, data: null }
      }
    } else if (role === 'care_coordinator') {
      const { error: coordinatorError } = await q.insertCareCoordinator(supabaseAdmin, {
        user_id: userId,
        agency_id: agencyId!,
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        status: 'active',
      })
      if (coordinatorError) {
        await rollbackProvisionalUserAccount(supabaseAdmin, userId)
        provisionalUserId = null
        return { error: `Failed to create care coordinator record: ${coordinatorError.message}`, data: null }
      }
    }
    // admin role: no extra table

    setupCompleted = true
    provisionalUserId = null

    await sendInvitationEmail(normalizedEmail, fullNameTrimmed, password)

    revalidatePath('/pages/admin/users')
    return {
      error: null,
      data: { success: true, userId, message: `User created. Invitation email sent to ${email}.` },
    }
  } catch (err: any) {
    if (!setupCompleted && provisionalUserId) {
      await rollbackProvisionalUserAccount(supabaseAdmin, provisionalUserId)
    }
    return { error: err?.message || 'Failed to create user account', data: null }
  }
}

/** Build company_name for clients from work_location and optional job/department (no schema change). */
function buildAgencyAdminCompanyName(workLocation: string, jobTitle?: string, department?: string): string {
  const parts = [workLocation.trim()]
  if (jobTitle?.trim()) parts.push(`Job: ${jobTitle.trim()}`)
  if (department?.trim()) parts.push(`Dept: ${department.trim()}`)
  return parts.join(' | ') || 'Agency Admin'
}

/**
 * Create an agency admin account. Inserts directly into user_profiles and sends an invitation email.
 * No table schema changes.
 */
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

  const supabaseAdmin = createAdminClient()
  const normalizedEmail = contactEmail.toLowerCase().trim()
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || normalizedEmail
  const tempPassword = randomBytes(12).toString('base64')

  try {
    // Check for existing user
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingProfile) {
      // Ensure agency_admins row exists
      const { data: existingAdmin } = await supabaseAdmin
        .from('agency_admins')
        .select('id')
        .eq('user_id', existingProfile.id)
        .maybeSingle()
      if (!existingAdmin) {
        await supabaseAdmin.from('agency_admins').insert({
          user_id: existingProfile.id,
          company_owner_id: existingProfile.id,
          contact_name: fullName,
          contact_email: normalizedEmail,
          contact_phone: contactPhone.trim() || null,
          status,
          agency_id: null,
        })
      }
      // Re-send invitation with a fresh password
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      await supabaseAdmin
        .from('user_profiles')
        .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
        .eq('id', existingProfile.id)
      await sendInvitationEmail(normalizedEmail, fullName, tempPassword)
      revalidatePath('/pages/admin/users')
      return {
        error: null,
        data: { success: true, userId: existingProfile.id, message: `User already exists. Invitation re-sent to ${contactEmail}.` },
      }
    }

    // New user
    const userId = randomUUID()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    const { error: insertError } = await supabaseAdmin.from('user_profiles').insert({
      id: userId,
      email: normalizedEmail,
      role: 'company_owner',
      full_name: fullName,
      password_hash: passwordHash,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (insertError) {
      return { error: `Failed to create agency admin: ${insertError.message}`, data: null }
    }

    const { error: adminError } = await supabaseAdmin.from('agency_admins').insert({
      user_id: userId,
      company_owner_id: userId,
      contact_name: fullName,
      contact_email: normalizedEmail,
      contact_phone: contactPhone.trim() || null,
      status,
      agency_id: null,
    })
    if (adminError) {
      console.error('Failed to create agency_admins row for agency admin:', adminError)
      await supabaseAdmin.from('user_profiles').delete().eq('id', userId)
      return { error: `User created but failed to create agency record: ${adminError.message}`, data: null }
    }

    await sendInvitationEmail(normalizedEmail, fullName, tempPassword)

    revalidatePath('/pages/admin/users')
    return {
      error: null,
      data: { success: true, userId, message: `Agency admin created. Invitation email sent to ${contactEmail}.` },
    }
  } catch (err: any) {
    return { error: err?.message || 'Failed to create agency admin account', data: null }
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

  const supabaseAdmin = createAdminClient()
  const normalizedEmail = email.toLowerCase().trim()
  const fullName = `${firstName} ${lastName}`.trim()
  const tempPassword = randomBytes(12).toString('base64')

  try {
    // Check for existing user
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingProfile) {
      // Re-send invitation with a fresh password
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      await supabaseAdmin
        .from('user_profiles')
        .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
        .eq('id', existingProfile.id)
      await sendInvitationEmail(normalizedEmail, fullName, tempPassword, agencyName)
      return {
        error: null,
        data: { success: true, userId: existingProfile.id, message: `User already exists. Invitation re-sent to ${email}.` },
      }
    }

    // New user
    const userId = randomUUID()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    const { error: insertError } = await supabaseAdmin.from('user_profiles').insert({
      id: userId,
      email: normalizedEmail,
      role: 'staff_member',
      full_name: fullName,
      password_hash: passwordHash,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (insertError) {
      return { error: `Failed to create user: ${insertError.message}`, data: null }
    }

    await sendInvitationEmail(normalizedEmail, fullName, tempPassword, agencyName)

    return {
      error: null,
      data: { success: true, userId, message: `User account created. Invitation email sent to ${email}.` },
    }
  } catch (err: any) {
    return { error: err.message || 'Failed to create user account', data: null }
  }
}
