import { managerVisitEditSchema } from '@/lib/schemas/manager-visit-edit'

const valid = {
  scheduledVisitId: '90000000-0000-4000-8000-000000000001',
  expectedUpdatedAt: '2026-11-13T15:00:00.000Z',
  visitDate: '2026-11-13',
  scheduledEndDate: '2026-11-13',
  scheduledStartTime: '10:00',
  scheduledEndTime: '11:00',
  caregiverMemberId: '90000000-0000-4000-8000-000000000002',
  status: 'completed' as const,
  visitTimezone: 'America/New_York' as const,
  actualStartAt: '2026-11-13T10:05',
  actualEndAt: '2026-11-13T10:55',
  billableHours: 0.83,
  changeNote: 'Synthetic manager-entered time after verification.',
  careVerified: true,
}

test('accepts a completed single-visit edit with local wall time and an explicit visit timezone', () => {
  expect(managerVisitEditSchema.safeParse(valid).success).toBe(true)
})

test('requires caregiver, both times, timezone, attestation, and a reason for completion', () => {
  const result = managerVisitEditSchema.safeParse({
    ...valid,
    caregiverMemberId: '',
    visitTimezone: '',
    actualEndAt: '',
    changeNote: 'short',
    careVerified: false,
  })
  expect(result.success).toBe(false)
  if (result.success) return
  const paths = result.error.issues.map(issue => issue.path[0])
  expect(paths).toEqual(expect.arrayContaining([
    'caregiverMemberId', 'actualEndAt', 'visitTimezone', 'changeNote', 'careVerified',
  ]))
})

test('allows start-only time only for an in-progress visit', () => {
  expect(managerVisitEditSchema.safeParse({
    ...valid, status: 'in_progress', actualEndAt: '', billableHours: 0,
  }).success).toBe(true)
  expect(managerVisitEditSchema.safeParse({
    ...valid, status: 'scheduled', actualEndAt: '', billableHours: 0,
  }).success).toBe(false)
})

test('rejects reversed scheduled and actual times', () => {
  const result = managerVisitEditSchema.safeParse({
    ...valid,
    scheduledEndTime: '09:00',
    actualEndAt: '2026-11-13T09:55',
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.error.issues.map(issue => issue.path[0])).toEqual(
    expect.arrayContaining(['scheduledEndTime', 'actualEndAt']),
  )
})
