/** Shared proximity scale used by requests, direct assignment, and shift advertising. */
export { proximityPercentFromMiles } from '@/lib/caregiver-matching'

/** Overall score: average of skill match (0-100) and proximity (0-100). */
export function overallScorePercent(skillMatchPercent: number, proximityPercent: number): number {
  return Math.round((skillMatchPercent + proximityPercent) / 2)
}
