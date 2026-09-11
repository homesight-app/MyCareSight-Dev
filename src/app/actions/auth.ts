'use server'

import { signOut, resetPassword, updatePassword } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { auth } from '@/auth'
import bcrypt from 'bcryptjs'

export { signOut }

/**
 * Check if an email exists in the app (user_profiles).
 * Used before sending password reset so we can show a clear message when the email is not registered.
 */
export async function checkEmailExistsForReset(email: string): Promise<{ exists: boolean; error?: string }> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()
    if (error) {
      return { exists: false, error: 'Unable to verify email. Please try again.' }
    }
    return { exists: !!data }
  } catch {
    return { exists: false, error: 'Unable to verify email. Please try again.' }
  }
}

/** Triggers a password reset email with a time-limited token link. */
export async function sendPasswordResetAction(email: string): Promise<{ error: string | null }> {
  return resetPassword(email)
}

/** Validates a reset token and writes the new bcrypt hash. Used by the reset-password page. */
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

  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('password_hash')
    .eq('id', session.user.id)
    .single()

  if (!profile?.password_hash) {
    return { error: 'No password set. Please use "Forgot password?" to set your password.' }
  }

  const isMatch = await bcrypt.compare(currentPassword, profile.password_hash)
  if (!isMatch) return { error: 'Current password is incorrect.' }

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

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('user_profiles')
    .update({ email: email.toLowerCase().trim() })
    .eq('id', session.user.id)

  if (error) return { error: 'Failed to update email. Please try again.' }
  return { error: null }
}
