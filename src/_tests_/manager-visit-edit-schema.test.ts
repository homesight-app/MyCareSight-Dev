import { managerVisitEditSchema } from '@/lib/schemas/manager-visit-edit'

const base = {
  scheduledVisitId: '90000000-0000-4000-8000-000000000001',
  expectedUpdatedAt: '2026-11-13T15:00:00.000Z',
  changeNote: 'Synthetic manager correction after verification.',
}

test('accepts each independently scoped manager visit command', () => {
  expect(managerVisitEditSchema.safeParse({
    ...base, scope: 'schedule', visitDate: '2026-11-13', scheduledEndDate: '2026-11-13',
    scheduledStartTime: '10:00', scheduledEndTime: '11:00',
  }).success).toBe(true)
  expect(managerVisitEditSchema.safeParse({
    ...base, scope: 'location', patientAddressId: '90000000-0000-4000-8000-000000000003',
  }).success).toBe(true)
  expect(managerVisitEditSchema.safeParse({
    ...base, scope: 'caregiver', caregiverMemberId: '90000000-0000-4000-8000-000000000002',
  }).success).toBe(true)
  expect(managerVisitEditSchema.safeParse({ ...base, scope: 'status', status: 'missed' }).success).toBe(true)
  expect(managerVisitEditSchema.safeParse({
    ...base, scope: 'time', actualStartAt: '2026-11-13T10:05',
    actualEndAt: '2026-11-13T10:55', careVerified: true,
  }).success).toBe(true)
})

test('status commands cannot directly set in-progress or completed', () => {
  expect(managerVisitEditSchema.safeParse({ ...base, scope: 'status', status: 'in_progress' }).success).toBe(false)
  expect(managerVisitEditSchema.safeParse({ ...base, scope: 'status', status: 'completed' }).success).toBe(false)
})

test('time commands require start, attestation, and reason', () => {
  const result = managerVisitEditSchema.safeParse({
    ...base, scope: 'time', actualStartAt: '', actualEndAt: '', careVerified: false, changeNote: 'short',
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.error.issues.map(issue => issue.path[0])).toEqual(expect.arrayContaining([
    'actualStartAt', 'careVerified', 'changeNote',
  ]))
})

test('time commands cannot change caregiver assignment, timezone, or calculated billing', () => {
  expect(managerVisitEditSchema.safeParse({
    ...base, scope: 'time', caregiverMemberId: '90000000-0000-4000-8000-000000000002',
    visitTimezone: 'America/New_York', billableHours: 4,
    actualStartAt: '2026-11-13T10:05', actualEndAt: '', careVerified: true,
  }).success).toBe(false)
})

test('allows start-only time for an in-progress visit and rejects reversed actual time', () => {
  expect(managerVisitEditSchema.safeParse({
    ...base, scope: 'time', actualStartAt: '2026-11-13T10:05',
    actualEndAt: '', careVerified: true,
  }).success).toBe(true)
  const reversed = managerVisitEditSchema.safeParse({
    ...base, scope: 'time', actualStartAt: '2026-11-13T10:05',
    actualEndAt: '2026-11-13T09:55', careVerified: true,
  })
  expect(reversed.success).toBe(false)
  if (!reversed.success) expect(reversed.error.issues.map(issue => issue.path[0])).toContain('actualEndAt')
})

test('schedule command rejects an end before its start', () => {
  const result = managerVisitEditSchema.safeParse({
    ...base, scope: 'schedule', visitDate: '2026-11-13', scheduledEndDate: '2026-11-13',
    scheduledStartTime: '10:00', scheduledEndTime: '09:00',
  })
  expect(result.success).toBe(false)
  if (!result.success) expect(result.error.issues.map(issue => issue.path[0])).toContain('scheduledEndTime')
})

test('location commands require a saved visit location', () => {
  const result = managerVisitEditSchema.safeParse({
    ...base, scope: 'location', patientAddressId: '',
  })
  expect(result.success).toBe(false)
  if (!result.success) expect(result.error.issues.map(issue => issue.path[0])).toContain('patientAddressId')
})
