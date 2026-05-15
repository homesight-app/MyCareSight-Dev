import * as q from '@/lib/supabase/query'

type MinimalProfile = {
  role?: string | null
}

type SupabaseLike = Parameters<typeof q.getUserProfileFull>[0]

export function getEffectiveCompanyOwnerUserId(profile: MinimalProfile | null, userId: string): string | null {
  if (!profile?.role) return null
  if (profile.role === 'company_owner') return userId
  return null
}

