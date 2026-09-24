type MinimalProfile = {
  role?: string | null
}

export function getEffectiveCompanyOwnerUserId(profile: MinimalProfile | null, userId: string): string | null {
  if (!profile?.role) return null
  if (profile.role === 'company_owner') return userId
  return null
}
