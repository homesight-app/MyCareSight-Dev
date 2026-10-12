import {
  eligibleCaregiverCandidates,
  proximityPercentFromMiles,
  type CaregiverMatchOption,
} from '@/lib/caregiver-matching'
import {
  publishVisitShiftOfferSchema,
  respondToVisitShiftOfferSchema,
} from '@/lib/schemas/visit-shift-offers'

const VISIT_ID = '10000000-0000-4000-8000-000000000001'
const CAREGIVER_ID = '20000000-0000-4000-8000-000000000001'
const OFFER_ID = '30000000-0000-4000-8000-000000000001'

function candidate(
  id: string,
  availability: CaregiverMatchOption['availability'],
  skillMatchPercent: number
): CaregiverMatchOption {
  return {
    id,
    name: 'Synthetic Caregiver',
    title: 'Caregiver',
    phone: '',
    availability,
    distanceMiles: 5,
    distanceLabel: '5.00 mi',
    skillMatchPercent,
    proximityPercent: 88,
    overallPercent: 94,
    matchedSkills: [],
    isCurrent: false,
  }
}

describe('visit shift offer validation', () => {
  test('selected audience requires at least one caregiver', () => {
    const result = publishVisitShiftOfferSchema.safeParse({
      visitId: VISIT_ID,
      audienceMode: 'selected',
      caregiverIds: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['caregiverIds'])
  })

  test('all eligible audience does not accept an invented response or oversized note', () => {
    expect(publishVisitShiftOfferSchema.safeParse({
      visitId: VISIT_ID,
      audienceMode: 'all_eligible',
      caregiverIds: [],
    }).success).toBe(true)
    expect(respondToVisitShiftOfferSchema.safeParse({
      offerId: OFFER_ID,
      response: 'accepted',
      caregiverNote: null,
    }).success).toBe(false)
    expect(respondToVisitShiftOfferSchema.safeParse({
      offerId: OFFER_ID,
      response: 'interested',
      caregiverNote: 'x'.repeat(1001),
    }).success).toBe(false)
  })
})

describe('shared caregiver eligibility and ranking rules', () => {
  test('advertising includes only available caregivers matching every required skill', () => {
    const eligible = candidate(CAREGIVER_ID, 'available', 100)
    const booked = candidate('20000000-0000-4000-8000-000000000002', 'booked', 100)
    const missingSkill = candidate('20000000-0000-4000-8000-000000000003', 'available', 50)
    expect(eligibleCaregiverCandidates([booked, missingSkill, eligible])).toEqual([eligible])
  })

  test('one proximity scale is used across the staffing workflow', () => {
    expect(proximityPercentFromMiles(0)).toBe(100)
    expect(proximityPercentFromMiles(20)).toBe(50)
    expect(proximityPercentFromMiles(40)).toBe(0)
  })
})
