export const STORAGE_BUCKET = {
  APPLICATION: 'application-documents',
  PATIENT: 'patient-documents',
  STAFF_MEMBER: 'staff-member-documents',
  LEAD: 'lead-documents',
  AGENCY: 'agency-documents',
  AGENCY_PUBLIC: 'agency-public',
  LICENSE_TEMPLATES: 'license-templates',
} as const

export type StorageBucket = typeof STORAGE_BUCKET[keyof typeof STORAGE_BUCKET]

export type UploadPurpose =
  | 'application-document'
  | 'caregiver-certification'
  | 'license-document'
  | 'license-requirement-template'
  | 'patient-incident'
  | 'playbook-template'

export type StoredFileUpload = {
  path: string
  cleanupToken: string
}

export const STORAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
