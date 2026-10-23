import { visitCorrectionSchema } from '@/lib/schemas/visit-correction'

const correction = {
  scheduledVisitId: '00000000-0000-4000-8000-000000000001',
  expectedStatus: 'missed' as const,
  correctedStatus: 'completed' as const,
  caregiverMemberId: '00000000-0000-4000-8000-000000000002',
  actualStartAt: '2026-10-19T09:00:00-07:00',
  actualEndAt: '2026-10-19T13:00:00-07:00',
  billableHours: 4,
  reason: 'Caregiver confirmed the service was delivered.',
  careVerified: true as const,
}

describe('visit correction input', () => {
  it('accepts a verified historical completion with explicit actual times', () => {
    expect(visitCorrectionSchema.safeParse(correction).success).toBe(true)
  })

  it('rejects a completion without attestation or with reversed actual times', () => {
    expect(visitCorrectionSchema.safeParse({ ...correction, careVerified: false }).success).toBe(false)
    expect(visitCorrectionSchema.safeParse({
      ...correction,
      actualEndAt: '2026-10-19T08:00:00-07:00',
    }).success).toBe(false)
  })

  it('requires a reason and limits corrections to the supported status transitions', () => {
    expect(visitCorrectionSchema.safeParse({ ...correction, reason: ' ' }).success).toBe(false)
    expect(visitCorrectionSchema.safeParse({ ...correction, expectedStatus: 'cancelled' }).success).toBe(false)
    expect(visitCorrectionSchema.safeParse({
      scheduledVisitId: correction.scheduledVisitId,
      expectedStatus: 'completed',
      correctedStatus: 'missed',
      reason: correction.reason,
    }).success).toBe(true)
  })
})
