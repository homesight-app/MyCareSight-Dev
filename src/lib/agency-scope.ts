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

export async function resolveEffectiveCompanyOwnerUserId(
  supabase: SupabaseLike,
  profile: MinimalProfile | null,
  userId: string
): Promise<string | null> {
  if (!profile?.role) return null

  if (profile.role === 'company_owner') {
    return userId
  }

  if (profile.role === 'care_coordinator' || profile.role === 'staff_member') {
    const { data: up } = await q.getAgencyIdFromProfile(supabase, userId)
    if (!up?.agency_id) return null

    const { data: ownerUid } = await q.getRepresentativeOwnerUserIdForAgency(supabase, up.agency_id)
    return ownerUid
  }

  return null
}
