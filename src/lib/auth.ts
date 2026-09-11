import { cache } from 'react'
import { auth, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from '@/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { sendPasswordResetEmail } from '@/lib/email'
import type { AgencyRole, UserRole } from '@/types/auth'

function isDynamicServerUsageError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    (error as { digest?: string }).digest === 'DYNAMIC_SERVER_USAGE'
  )
}

// Single source of truth for the session on every server request.
// React.cache() memoizes per request — multiple callers pay for one DB query total.
// is_active is fetched fresh every time; it is never read from the JWT.
export const getSession = cache(async () => {
  try {
    const session = await auth()
    if (!session?.user?.id) return null

    const userId = session.user.id
    const supabase = createAdminClient()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select(
        'id, email, role, full_name, agency_id, is_active, last_login_at, created_at, updated_at, user_agency_roles ( agency_id, role, status )'
      )
      .eq('id', userId)
      .single()

    if (!profile || !profile.is_active) return null

    type RawRole = { agency_id: string; role: string; status: string }
    const agencyRoles: AgencyRole[] = (
      (profile.user_agency_roles as RawRole[]) ?? []
    )
      .filter(r => ['active', 'invited', 'pending'].includes(r.status))
      .map(r => ({
        agency_id: r.agency_id,
        role: r.role as AgencyRole['role'],
        status: r.status,
      }))

    return {
      user: {
        id: userId,
        email: session.user.email ?? profile.email ?? '',
      },
      profile: {
        id: profile.id,
        email: profile.email,
        role: profile.role as UserRole,
        full_name: profile.full_name,
        agency_id: profile.agency_id,
        is_active: profile.is_active,
        last_login_at: profile.last_login_at,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      agencyRoles,
    }
  } catch (error) {
    if (isDynamicServerUsageError(error)) throw error
    return null
  }
})

export async function signOut() {
  await nextAuthSignOut({ redirectTo: '/pages/auth/login' })
}

// Used by server-side callers only. The login page uses next-auth/react signIn directly.
export async function signIn(email: string, password: string) {
  try {
    await nextAuthSignIn('credentials', { email, password, redirect: false })
    return { error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid credentials'
    return { error: msg }
  }
}

export async function resetPassword(email: string) {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, email, full_name')
    .eq('email', email.toLowerCase().trim())
    .single()

  // Always return success to prevent user enumeration
  if (!profile) return { error: null }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  await supabase
    .from('user_profiles')
    .update({ invite_token: token, invite_token_expires_at: expiresAt })
    .eq('id', profile.id)

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000'
  const resetLink = `${baseUrl}/pages/auth/reset-password?token=${token}`

  // In dev, always log the link so it's testable without Mailgun configured
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEV] Password reset link:', resetLink)
  }

  const emailResult = await sendPasswordResetEmail(profile.email ?? email, resetLink)
  if (!emailResult.success) {
    console.error('[resetPassword] Email send failed:', emailResult.error)
    // In production, surface the failure. In dev, succeed so the console link is usable.
    if (process.env.NODE_ENV !== 'development') {
      return { error: 'Failed to send reset email. Please try again.' }
    }
  }

  return { error: null }
}

// token param: provided for unauthenticated resets (email link flow).
// No token: requires an active session (change-password flow).
export async function updatePassword(newPassword: string, token?: string) {
  const supabase = createAdminClient()

  if (token) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, invite_token_expires_at')
      .eq('invite_token', token)
      .single()

    if (!profile) return { error: 'Invalid or expired reset link.' }

    if (new Date(profile.invite_token_expires_at) < new Date()) {
      return { error: 'Reset link has expired. Please request a new one.' }
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await supabase
      .from('user_profiles')
      .update({ password_hash: passwordHash, invite_token: null, invite_token_expires_at: null })
      .eq('id', profile.id)

    return { error: null }
  }

  // Authenticated change — must have an active session
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated.' }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await supabase
    .from('user_profiles')
    .update({ password_hash: passwordHash })
    .eq('id', session.user.id)

  return { error: null }
}
