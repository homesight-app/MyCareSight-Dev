const destinations: Record<string, string> = {
  admin: '/pages/admin', expert: '/pages/expert/clients',
  staff_member: '/pages/caregiver', care_coordinator: '/pages/agency/clients',
  company_owner: '/pages/agency',
}

export class LoginSessionUnavailableError extends Error {
  constructor() {
    super('We could not confirm your session. Reload the login page and try again. If this continues, contact support.')
    this.name = 'LoginSessionUnavailableError'
  }
}

/** Confirm that the browser's cookie works before selecting a protected destination. */
export async function getConfirmedLoginDestination(): Promise<string> {
  const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new LoginSessionUnavailableError()
  let data: unknown
  try { data = await response.json() } catch { throw new LoginSessionUnavailableError() }
  const user = data && typeof data === 'object' && 'user' in data ? data.user : null
  if (!user || typeof user !== 'object' || !('id' in user)
    || typeof user.id !== 'string' || !user.id.trim() || !('role' in user)
    || typeof user.role !== 'string' || !Object.hasOwn(destinations, user.role)) {
    throw new LoginSessionUnavailableError()
  }
  return destinations[user.role]
}
