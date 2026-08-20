import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { UserRole, AgencyRole } from '@/types/auth'

function isDynamicServerUsageError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    (error as { digest?: string }).digest === 'DYNAMIC_SERVER_USAGE'
  )
}

export const getSession = cache(async () => {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    // Get user profile with role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // Load agency roles for permission checks (no extra DB query in server actions)
    const { data: agencyRolesData } = await supabase
      .from('user_agency_roles')
      .select('agency_id, role, status')
      .eq('user_id', user.id)
      .in('status', ['active', 'invited', 'pending'])

    const agencyRoles: AgencyRole[] = (agencyRolesData ?? []) as AgencyRole[]

    return {
      user,
      profile,
      agencyRoles,
    }
  } catch (error) {
    // Let Next.js handle dynamic-render bailouts for routes using cookies/headers.
    if (isDynamicServerUsageError(error)) {
      throw error
    }

    console.error('getSession failed:', error)
    return null
  }
})

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}

export async function signIn(email: string, password: string, rememberMe: boolean = false) {
  const supabase = await createClient()
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error }
  }

  // If remember me is checked, extend session duration
  if (rememberMe && data.session) {
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  }

  // HIPAA § 164.312(b): record login timestamp for audit trail
  if (data.user) {
    await supabase
      .from('user_profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id)
  }

  return { data, error: null }
}

export async function signUp(email: string, password: string, fullName: string, role: UserRole) {
  const supabase = await createClient()
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: {
        full_name: fullName,
        role,
      },
    },
  })

  if (error) {
    return { error }
  }

  // User profile is automatically created by database trigger (handle_new_user)
  // No need to manually insert as it would violate RLS policies

  return { data, error: null }
}

export async function resetPassword(email: string) {
  const supabase = await createClient()
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL }/pages/auth/reset-password`,
  })

  return { error }
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient()
  
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  return { error }
}


