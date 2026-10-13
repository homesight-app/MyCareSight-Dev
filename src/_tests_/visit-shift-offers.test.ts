import {
  eligibleCaregiverCandidates,
  overallCaregiverMatchPercent,
  proximityPercentFromMiles,
  type CaregiverMatchOption,
} from '@/lib/caregiver-matching'
import {
  publishVisitShiftOfferSchema,
  respondToVisitShiftOfferSchema,
} from '@/lib/schemas/visit-shift-offers'
import { patientCaregiverSkillsSchema } from '@/lib/schemas/patient-caregiver-skills'

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
    preferredSkillMatchPercent: 0,
    proximityPercent: 88,
    overallPercent: 94,
    matchedSkills: [],
    matchedPreferredSkills: [],
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

  test('preferred skills improve ranking without changing required-skill eligibility', () => {
    const preferredMatch = candidate(CAREGIVER_ID, 'available', 100)
    preferredMatch.preferredSkillMatchPercent = 100
    preferredMatch.overallPercent = overallCaregiverMatchPercent(100, 100, 50, true)
    const preferredMiss = candidate('20000000-0000-4000-8000-000000000004', 'available', 100)
    preferredMiss.overallPercent = overallCaregiverMatchPercent(100, 0, 50, true)

    expect(preferredMatch.overallPercent).toBeGreaterThan(preferredMiss.overallPercent)
    expect(eligibleCaregiverCandidates([preferredMiss, preferredMatch])).toHaveLength(2)
  })

  test('client skill input normalizes values and prevents required/preferred overlap', () => {
    const normalized = patientCaregiverSkillsSchema.parse({
      patientId: VISIT_ID,
      requiredSkills: [' Wound Care ', 'Wound Care'],
      preferredSkills: ['Spanish'],
    })
    expect(normalized.requiredSkills).toEqual(['Wound Care'])
    expect(patientCaregiverSkillsSchema.safeParse({
      patientId: VISIT_ID,
      requiredSkills: ['Wound Care'],
      preferredSkills: ['Wound Care'],
    }).success).toBe(false)
  })
})
