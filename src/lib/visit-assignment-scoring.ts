/** Shared proximity scale used by requests, direct assignment, and shift advertising. */
export { proximityPercentFromMiles } from '@/lib/caregiver-matching'
import { overallCaregiverMatchPercent } from '@/lib/caregiver-matching'

/** Required skills carry twice the preference weight; proximity shares the final score equally. */
export function overallScorePercent(
  skillMatchPercent: number,
  proximityPercent: number,
  preferredSkillMatchPercent?: number
): number {
  return overallCaregiverMatchPercent(
    skillMatchPercent,
    preferredSkillMatchPercent ?? 100,
    proximityPercent,
    preferredSkillMatchPercent !== undefined
  )
}
