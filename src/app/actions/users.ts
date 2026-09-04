'use server'

import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import * as q from '@/lib/supabase/query'
import { getSession } from '@/lib/auth'

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

export async function setUserPassword(userId: string, newPassword: string) {
  const supabase = await createClient()

  try {
    const { data: userProfile, error: fetchError } = await q.getUserProfileEmail(supabase, userId)

    if (fetchError || !userProfile) {
      return { error: 'User not found', data: null }
    }

    const { error: updateError } = await q.rpcUpdateUserPassword(supabase, userId, newPassword)

    if (updateError) {
      if (updateError.message.includes('could not find the function') || updateError.message.includes('does not exist')) {
        return {
          error: 'Database function not found. Please run the migration file 015_update_user_password_function.sql in Supabase SQL Editor first.',
          data: null,
        }
      }
      return { error: updateError.message, data: null }
    }

    revalidatePath('/pages/admin/users')
    return {
      error: null,
      data: {
        success: true,
        message: `Password has been set for ${userProfile.email}. Email notification should be sent separately.`,
      },
    }
  } catch (err: any) {
    return { error: err.message || 'Failed to set password', data: null }
  }
}

/** Role value for new users created from admin User Management */
export type CreateUserRole = 'admin' | 'company_owner' | 'staff_member' | 'expert' | 'care_coordinator'

type SupabaseAdminClient = ReturnType<typeof createAdminClient>

/**
 * Poll until `user_profiles` exists for `userId` (handle_new_user).
 * Default: first check immediately, then up to `maxRetries` more attempts spaced by `intervalMs`.
 */
async function waitForUserProfileRow(
  admin: SupabaseAdminClient,
  userId: string,
  options?: { maxRetries?: number; intervalMs?: number }
) {
  const maxRetries = options?.maxRetries ?? 3
  const intervalMs = options?.intervalMs ?? 200
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data } = await admin.from('user_profiles').select('id').eq('id', userId).maybeSingle()
    if (data?.id) return true
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  return false
}

/**
 * Best-effort undo after auth user exists but app-specific setup failed.
 * Order: unlink from agencies → role tables → user_profiles → auth.users
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
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId)
    if (delAuthErr) {
      console.error('rollbackProvisionalUserAccount: deleteUser failed', delAuthErr.message)
    }
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

function buildMagicLinkRedirectUrl(siteUrl: string | undefined) {
  const baseUrl = siteUrl?.trim() ? siteUrl : 'http://localhost:3000'
  const redirectUrl = new URL('/auth/callback', baseUrl)
  redirectUrl.searchParams.set('type', 'magiclink')
  return redirectUrl.toString()
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
 * Create a user account from admin User Management. Uses Admin API so the current
 * admin's session is never overwritten (unlike signUp() which would log the admin out).
 * When role is company_owner, staff_member, or care_coordinator, agencyId is required and the user is assigned to that agency.
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
  let supabaseAdmin
  try {
    supabaseAdmin = createAdminClient()
  } catch (e: any) {
    return {
      error:
        e?.message ||
        'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local for creating user accounts.',
      data: null,
    }
  }
  const supabaseCookie = await createClient()

  let provisionalUserId: string | null = null
  let setupCompleted = false

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
    const normalizedEmail = email.toLowerCase().trim()
    const userMetadata: Record<string, string> = {
      full_name: fullName.trim(),
      role,
      temporary_password: password,
    }

    if (role === 'care_coordinator' && !agencyId) {
      return { error: 'Agency is required for care coordinator role.', data: null }
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    })

    let userId: string | null = null

    if (createError) {
      if (
        createError.message.includes('already registered') ||
        createError.message.includes('already exists') ||
        createError.message.includes('User already registered')
      ) {
        const { data: existingProfile } = await q.getUserProfileByEmail(supabaseAdmin, normalizedEmail)
        userId = existingProfile?.id || null
        if (userId) {
          await ensureRoleTableRow(supabaseAdmin, userId, fullName.trim(), normalizedEmail, role)
          await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: userMetadata })
        }
        const { error: magicLinkError } = await supabaseCookie.auth.signInWithOtp({
          email: normalizedEmail,
          options: { emailRedirectTo: buildMagicLinkRedirectUrl(siteUrl), shouldCreateUser: false },
        })
        if (magicLinkError) {
          return { error: `User already exists. Failed to send login link: ${magicLinkError.message}`, data: null }
        }
        revalidatePath('/pages/admin/users')
        return {
          error: null,
          data: { success: true, userId, message: `User already exists. Login link sent to ${email}.` },
        }
      }
      const errorMessage =
        createError.message.includes('Database error') || createError.message.includes('database')
          ? 'Database error creating user. Ensure handle_new_user migration has been applied.'
          : createError.message
      return { error: `Failed to create user: ${errorMessage}`, data: null }
    }

    if (!newUser?.user?.id) {
      return { error: 'Failed to create user account - no user returned', data: null }
    }
    userId = newUser.user.id
    provisionalUserId = userId

    const profileReady = await waitForUserProfileRow(supabaseAdmin, userId)
    if (!profileReady) {
      await rollbackProvisionalUserAccount(supabaseAdmin, userId)
      provisionalUserId = null
      return {
        error:
          'Auth user was created but user profile did not appear in time (handle_new_user). The incomplete account was removed.',
        data: null,
      }
    }

    // Insert into role-specific table so the user appears in the right tab
    const fullNameTrimmed = fullName.trim()
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
        return {
          error: `Failed to create agency record: ${adminError.message}`,
          data: null,
        }
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
        return {
          error: `Failed to create staff record: ${staffError.message}`,
          data: null,
        }
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
        return {
          error: `Failed to create expert record: ${expertError.message}`,
          data: null,
        }
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
        return {
          error: `Failed to create care coordinator record: ${coordinatorError.message}`,
          data: null,
        }
      }
    }
    // admin role: no extra table

    setupCompleted = true
    provisionalUserId = null

    const { error: magicLinkError } = await supabaseCookie.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: buildMagicLinkRedirectUrl(siteUrl), shouldCreateUser: false },
    })
    if (magicLinkError) console.warn('Failed to send magic link:', magicLinkError.message)

    revalidatePath('/pages/admin/users')
    return {
      error: null,
      data: { success: true, userId, message: `User created. Login link sent to ${email}.` },
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
 * Create an agency admin: auth user (→ user_profiles via trigger) first, then clients row.
 * Sends magic link for first login. No table schema changes.
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
  let supabaseAdmin
  try {
    supabaseAdmin = createAdminClient()
  } catch (e: any) {
    return {
      error:
        e?.message ||
        'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local for creating agency admin accounts.',
      data: null,
    }
  }
  const supabaseCookie = await createClient()

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
    const normalizedEmail = contactEmail.toLowerCase().trim()
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || normalizedEmail
    // const companyName = buildAgencyAdminCompanyName(workLocation, jobTitle, department)
    const defaultPassword = randomBytes(12).toString('base64')

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'company_owner',
      },
    })

    let userId: string | null = null

    if (createError) {
      if (
        createError.message.includes('already registered') ||
        createError.message.includes('already exists') ||
        createError.message.includes('User already registered')
      ) {
        const { data: existingProfile } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle()
        userId = existingProfile?.id ?? null
        if (userId) {
          const { data: existingAdmin } = await supabaseAdmin
            .from('agency_admins')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()
          if (!existingAdmin) {
            await supabaseAdmin.from('agency_admins').insert({
              user_id: userId,
              company_owner_id: userId,
              contact_name: fullName,
              contact_email: normalizedEmail,
              contact_phone: contactPhone.trim() || null,
              status,
              agency_id: null,
            })
          }
        }
        const { error: magicLinkError } = await supabaseCookie.auth.signInWithOtp({
          email: normalizedEmail,
          options: { emailRedirectTo: `${siteUrl}/auth/callback?type=magiclink`, shouldCreateUser: false },
        })
        if (magicLinkError) {
          return { error: `User already exists. Failed to send login link: ${magicLinkError.message}`, data: null }
        }
        revalidatePath('/pages/admin/users')
        return {
          error: null,
          data: { success: true, userId, message: `User already exists. Login link sent to ${contactEmail}.` },
        }
      }
      const errorMessage =
        createError.message.includes('Database error') || createError.message.includes('database')
          ? 'Database error creating user. Ensure handle_new_user migration has been applied.'
          : createError.message
      return { error: `Failed to create agency admin: ${errorMessage}`, data: null }
    }

    if (!newUser?.user?.id) {
      return { error: 'Failed to create agency admin - no user returned', data: null }
    }
    userId = newUser.user.id

    const profileReady = await waitForUserProfileRow(supabaseAdmin, userId)
    if (!profileReady) {
      return {
        error:
          'Auth user was created but user profile did not appear in time (handle_new_user). Try again or remove the incomplete auth user.',
        data: null,
      }
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
      await rollbackProvisionalUserAccount(supabaseAdmin, userId)
      return {
        error: `User created but failed to create agency record: ${adminError.message}`,
        data: null,
      }
    }

    const { error: magicLinkError } = await supabaseCookie.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: `${siteUrl}/auth/callback?type=magiclink`, shouldCreateUser: false },
    })
    if (magicLinkError) console.warn('Failed to send magic link:', magicLinkError.message)

    revalidatePath('/pages/admin/users')
    return {
      error: null,
      data: { success: true, userId, message: `Agency admin created. Login link sent to ${contactEmail}.` },
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
  // Use admin client for user creation so the current user's session is NEVER overwritten.
  // signUp() with the cookie-based client would set the new user's session and log out the agency admin.
  let supabaseAdmin
  try {
    supabaseAdmin = createAdminClient()
  } catch (e: any) {
    return {
      error:
        e?.message ||
        'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local for creating staff accounts.',
      data: null,
    }
  }
  const supabaseCookie = await createClient()

  const generatedPassword = randomBytes(12).toString('base64')

  // For Supabase Magic Link email template: {{ .Data.agency_name }} and {{ .Data.temporary_password }}
  const userMetadata: Record<string, string> = {
    full_name: `${firstName} ${lastName}`,
    role: 'staff_member',
    agency_name: agencyName ?? 'Your Agency',
    temporary_password: generatedPassword,
  }

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
    const normalizedEmail = email.toLowerCase().trim()

    // Create user via Admin API (no session change; never touches cookie client auth)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: userMetadata,
    })

    let userId: string | null = null

    if (createError) {
      // User might already exist
      if (
        createError.message.includes('already registered') ||
        createError.message.includes('already exists') ||
        createError.message.includes('User already registered')
      ) {
        const { data: existingProfile } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .eq('email', normalizedEmail)
          .single()

        userId = existingProfile?.id || null

        // Update existing user metadata so Magic Link email template has agency_name and temporary_password
        await supabaseAdmin.auth.admin.updateUserById(userId!, { user_metadata: userMetadata })

        // Send magic link using cookie client (only sends email; does not set session)
        const { error: magicLinkError } = await supabaseCookie.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            emailRedirectTo: `${siteUrl}/auth/callback?type=magiclink`,
            shouldCreateUser: false,
          },
        })

        if (magicLinkError) {
          return {
            error: `User already exists. Failed to send login link: ${magicLinkError.message}`,
            data: null,
          }
        }

        return {
          error: null,
          data: {
            success: true,
            userId: userId,
            message: `User already exists. Login link sent to ${email}.`,
          },
        }
      }

      let errorMessage = createError.message
      if (
        createError.message.includes('Database error') ||
        createError.message.includes('database')
      ) {
        errorMessage =
          'Database error creating user account. Please ensure handle_new_user / caregiver_members migrations are applied.'
      }
      return { error: `Failed to create user: ${errorMessage}`, data: null }
    }

    if (!newUser?.user) {
      return { error: 'Failed to create user account - no user returned', data: null }
    }

    userId = newUser.user.id

    if (!userId) {
      return { error: 'Failed to create user account - user ID is missing', data: null }
    }

    const profileReady = await waitForUserProfileRow(supabaseAdmin, userId)
    let verifiedUserId = userId
    if (profileReady) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('id, role')
        .eq('id', userId)
        .single()
      if (!profileError && profile) {
        verifiedUserId = profile.id
      }
    } else {
      console.warn('User profile not found after creation (handle_new_user retries exhausted):', userId)
      const { data: profileByEmail } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle()
      if (profileByEmail?.id) {
        verifiedUserId = profileByEmail.id
      }
    }

    userId = verifiedUserId

    // Optional: send magic link via cookie client (sends email only; does not set session)
    const { error: magicLinkError } = await supabaseCookie.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?type=magiclink`,
        shouldCreateUser: false,
      },
    })
    if (magicLinkError) {
      console.warn('Failed to send magic link:', magicLinkError.message)
    }

    if (!userId) {
      return { error: 'Failed to get user ID after account creation', data: null }
    }

    return {
      error: null,
      data: {
        success: true,
        userId,
            message: `User account created. Login link sent to ${email}.`,
      },
    }
  } catch (err: any) {
    return { error: err.message || 'Failed to create user account', data: null }
  }
}
