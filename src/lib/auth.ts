import { cache } from 'react'
import { headers } from 'next/headers'
import { auth, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from '@/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import {
  consumePasswordResetToken,
  createPasswordReset,
  readCurrentIdentity,
  updateUserPassword,
} from '@/lib/repositories/auth-identity'

function isDynamicServerUsageError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'digest' in error
    && (error as { digest?: string }).digest === 'DYNAMIC_SERVER_USAGE'
  )
}

async function clientIpAddress(): Promise<string | null> {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || null
}

export const getSession = cache(async () => {
  try {
    const session = await auth()
    if (!session?.user?.id) return null

    const profile = await readCurrentIdentity(session.user.id)
    if (!profile) return null
    return {
      user: { id: profile.id, email: profile.email },
      profile: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        full_name: profile.full_name,
        agency_id: profile.agency_id,
        is_active: profile.is_active,
        last_login_at: profile.last_login_at,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      agencyRoles: profile.agencyRoles,
    }
  } catch (error) {
    if (isDynamicServerUsageError(error)) throw error
    return null
  }
})

export async function signOut() {
  await nextAuthSignOut({ redirectTo: '/pages/auth/login' })
}

export async function signIn(email: string, password: string) {
  try {
    await nextAuthSignIn('credentials', { email, password, redirect: false })
    return { error: null }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid credentials'
    return { error: message }
  }
}

export async function resetPassword(email: string) {
  const reset = await createPasswordReset({ email, ipAddress: await clientIpAddress() })
  if (!reset) return { error: null }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000'
  // Keep the credential in the URL fragment so browsers do not send it in HTTP request logs.
  const resetLink = `${baseUrl}/pages/auth/reset-password#token=${encodeURIComponent(reset.token)}`
  const emailResult = await sendPasswordResetEmail(reset.email, resetLink)
  if (!emailResult.success) {
    console.error('[resetPassword] Email provider rejected password-reset delivery')
  }
  return { error: null }
}

export async function updatePassword(newPassword: string, token?: string) {
  if (newPassword.length < 8 || newPassword.length > 256) {
    return { error: 'Password must be between 8 and 256 characters.' }
  }
  if (token) {
    const updated = await consumePasswordResetToken(token, newPassword)
    return { error: updated ? null : 'Invalid or expired reset link.' }
  }
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated.' }
  await updateUserPassword(session.user.id, newPassword)
  return { error: null }
}
