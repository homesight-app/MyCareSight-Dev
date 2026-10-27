import {
  AGENCY_MANAGER_ROLES,
  PLATFORM_OR_AGENCY_MANAGER_ROLES,
  isAgencyManagerRole,
} from '@/lib/role-capabilities'
import {
  decodeVisitTaskCodes,
  extractVisitTaskToken,
  isUuidToken,
  isVisitTaskAssigned,
  visitTaskAnytimeFrequency,
  visitTaskAssignmentKey,
  visitTaskAnytimeOccurrence,
  visitTaskSlotKey,
} from '@/lib/visit-task-codes'
import { normalizeUsZipForLookup } from '@/lib/us-postal-code'

describe('shared visit-domain rules', () => {
  it('keeps agency management roles aligned to current Auth.js roles', () => {
    expect([...AGENCY_MANAGER_ROLES]).toEqual(['company_owner', 'care_coordinator'])
    expect([...PLATFORM_OR_AGENCY_MANAGER_ROLES]).toEqual([
      'admin',
      'expert',
      'company_owner',
      'care_coordinator',
    ])
    expect(isAgencyManagerRole('company_owner')).toBe(true)
    expect(isAgencyManagerRole('agency_admin')).toBe(false)
    expect(isAgencyManagerRole('staff_member')).toBe(false)
  })

  it('decodes legacy and current visit task tokens consistently', () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    const taskNames = new Map([[taskId, 'Medication reminder']])

    expect(extractVisitTaskToken(`morning::${taskId}`)).toBe(taskId)
    expect(visitTaskSlotKey(`morning::${taskId}`)).toBe('morning')
    expect(isUuidToken(taskId)).toBe(true)
    expect(decodeVisitTaskCodes([`morning::${taskId}`, 'Meal preparation'], taskNames)).toEqual([
      'Medication reminder',
      'Meal preparation',
    ])
  })

  it('keeps an Anytime task single while preserving its assigned daily frequency', () => {
    const task = 'Meal preparation'
    expect(visitTaskAnytimeFrequency(`any::${task}::2`)).toBe(2)
    expect(visitTaskAnytimeFrequency(`any::${task}`)).toBe(1)
    expect(visitTaskAssignmentKey(`any::${task}::2`)).toBe(`any::${task}`)
    expect(decodeVisitTaskCodes([`any::${task}::2`, `morning::${task}`])).toEqual([
      `${task} · Anytime 2×`,
      task,
    ])
  })

  it('identifies repeated Anytime occurrences independently and keeps legacy combined assignments exclusive', () => {
    expect(visitTaskAnytimeOccurrence('any::Feeding::2::2')).toEqual({ total: 2, ordinal: 2 })
    expect(visitTaskAssignmentKey('any::Feeding::2::1')).toBe('any::Feeding::1')
    expect(visitTaskAssignmentKey('any::Feeding::2::2')).toBe('any::Feeding::2')
    expect(isVisitTaskAssigned(new Set(['any::Feeding::1']), 'any::Feeding::2::2')).toBe(false)
    expect(isVisitTaskAssigned(new Set(['any::Feeding']), 'any::Feeding::2::2')).toBe(true)
    expect(decodeVisitTaskCodes(['any::Feeding::2::1', 'any::Feeding::2::2'])).toEqual([
      'Feeding · Anytime 1 of 2', 'Feeding · Anytime 2 of 2',
    ])
  })

  it('normalizes US ZIP+4 values for distance lookup', () => {
    expect(normalizeUsZipForLookup('92054-1234')).toBe('92054')
    expect(normalizeUsZipForLookup('invalid')).toBeNull()
  })
})

