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
  | 'lead-document'
  | 'agency-document'
  | 'patient-document'
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
// Existing migrated documents can exceed the current new-upload limit.
export const STORAGE_DOWNLOAD_MAX_BYTES = 50 * 1024 * 1024

export const STORAGE_UPLOAD_FILE_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
}
