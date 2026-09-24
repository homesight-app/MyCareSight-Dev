import {
  createServiceContract,
  deleteContract,
  readServiceContracts,
  setContractStatus,
  updateContractDetails,
} from '@/lib/repositories/patient-service-contracts'

export type { PatientServiceContractRow } from '@/lib/repositories/patient-service-contracts'

export const getPatientServiceContractsByPatientId = readServiceContracts
export const insertPatientServiceContract = createServiceContract
export const updatePatientServiceContractStatus = setContractStatus
export const updatePatientServiceContractDetails = updateContractDetails
export const deletePatientServiceContract = deleteContract
