import { getEffectiveCompanyOwnerUserId } from '@/lib/agency-scope'

const userId = 'user-abc-123'

describe('getEffectiveCompanyOwnerUserId', () => {
  it('returns userId for company_owner role', () => {
    expect(getEffectiveCompanyOwnerUserId({ role: 'company_owner' }, userId)).toBe(userId)
  })

  it('returns null for care_coordinator (requires async DB lookup)', () => {
    expect(getEffectiveCompanyOwnerUserId({ role: 'care_coordinator' }, userId)).toBeNull()
  })

  it('returns null for staff_member', () => {
    expect(getEffectiveCompanyOwnerUserId({ role: 'staff_member' }, userId)).toBeNull()
  })

  it('returns null for admin', () => {
    expect(getEffectiveCompanyOwnerUserId({ role: 'admin' }, userId)).toBeNull()
  })

  it('returns null for null profile', () => {
    expect(getEffectiveCompanyOwnerUserId(null, userId)).toBeNull()
  })

  it('returns null when role is null', () => {
    expect(getEffectiveCompanyOwnerUserId({ role: null }, userId)).toBeNull()
  })

  it('returns null for unknown role', () => {
    expect(getEffectiveCompanyOwnerUserId({ role: 'unknown_role' }, userId)).toBeNull()
  })
})
