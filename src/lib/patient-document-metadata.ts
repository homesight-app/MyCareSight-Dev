import type { PatientDocument } from '@/lib/supabase/query/patients'

/** Decode the patient document list without silently dropping stored entries. */
export function readPatientDocuments(value: unknown): PatientDocument[] {
  if (value == null) return []

  let decoded: unknown = value
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded)
    } catch {
      throw new Error('Stored patient documents are not valid JSON')
    }
  }

  if (!Array.isArray(decoded) || !decoded.every((doc) =>
    doc !== null &&
    typeof doc === 'object' &&
    typeof doc.id === 'string' &&
    typeof doc.path === 'string'
  )) {
    throw new Error('Stored patient documents are not a valid document list')
  }

  return decoded as PatientDocument[]
}
