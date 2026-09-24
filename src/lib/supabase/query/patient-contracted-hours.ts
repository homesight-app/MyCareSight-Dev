import {
  createWeeklyHours,
  deleteContract,
  readActiveWeeklyHours,
  readWeeklyHours,
} from '@/lib/repositories/patient-service-contracts'

export type { PatientContractedHoursRow } from '@/lib/repositories/patient-service-contracts'

export const getPatientContractedHoursByPatientId = readWeeklyHours
export const insertPatientContractedHours = createWeeklyHours
export const getActiveContractedHoursForDate = readActiveWeeklyHours

export function deletePatientContractedHours(id: string) {
  return deleteContract(id, true)
}
