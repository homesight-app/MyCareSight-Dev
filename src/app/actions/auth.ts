'use server'

import { signOut, resetPassword, updatePassword } from '@/lib/auth'
import { auth } from '@/auth'
import sql from '@/db'
import { verifyPassword } from '@/lib/auth/password'

export { signOut }

/** Triggers a password reset email with a time-limited token link. */
export async function sendPasswordResetAction(email: string): Promise<{ error: string | null }> {
  return resetPassword(email)
}

/** Validates a one-time reset token and writes a new Argon2id hash. */
export async function updatePasswordWithTokenAction(
  token: string,
  newPassword: string
): Promise<{ error: string | null }> {
  return updatePassword(newPassword, token)
}

/**
 * Verifies the current password then updates to the new one.
 * Used by the authenticated change-password page and ChangePasswordModal.
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated.' }

  const [profile] = await sql<{ password_hash: string | null }[]>`
    SELECT password_hash FROM user_profiles WHERE id = ${session.user.id} LIMIT 1
  `

  if (!profile?.password_hash) {
    return { error: 'No password set. Please use "Forgot password?" to set your password.' }
  }

  const passwordResult = await verifyPassword(currentPassword, profile.password_hash)
  if (!passwordResult.valid) return { error: 'Current password is incorrect.' }

  return updatePassword(newPassword)
}

/** Updates the password for the current session user without requiring the current password. Used by ChangePasswordModal. */
export async function updateCurrentUserPasswordAction(
  newPassword: string
): Promise<{ error: string | null }> {
  return updatePassword(newPassword)
}

/** Updates the email address in user_profiles for the current session user. */
export async function updateUserEmailAction(email: string): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated.' }

  try {
    await sql`UPDATE user_profiles SET email = ${email.toLowerCase().trim()} WHERE id = ${session.user.id}`
  } catch {
    return { error: 'Failed to update email. Please try again.' }
  }
  return { error: null }
}
