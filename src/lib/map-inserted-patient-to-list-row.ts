/**
 * Normalize a freshly inserted patient row into the agency clients table row shape (including age).
 */

export interface RepresentativeEmbed {
  id: string
  name: string
  relationship: string | null
  phone_number: string | null
  email_address: string | null
}

export interface ClientsListPatient {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string
  age: number | null
  gender: string | null
  class: string | null
  phone_number: string
  email_address: string
  emergency_contact_name: string
  emergency_phone: string
  representative_1_name: string | null
  representative_1_relationship: string | null
  representative_1_phone: string | null
  representative_2_name: string | null
  representative_2_relationship: string | null
  representative_2_phone: string | null
  status: 'active' | 'inactive'
  created_at: string
  patients_representatives: RepresentativeEmbed[]
}

function ageFromDobYmd(dob: string | null | undefined): number | null {
  if (!dob || typeof dob !== 'string') return null
  const ymd = dob.split('T')[0] ?? dob
  const parts = ymd.split('-').map(Number)
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
  const [year, month, day] = parts as [number, number, number]
  const birth = new Date(year, month - 1, day)
  if (!Number.isFinite(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? age : null
}

export function mapInsertedPatientToListPatient(raw: Record<string, unknown>): ClientsListPatient {
  const reps = Array.isArray(raw.patients_representatives) ? raw.patients_representatives : []
  const representatives = reps as RepresentativeEmbed[]
  const dobRaw = typeof raw.date_of_birth === 'string' ? raw.date_of_birth : ''
  const dobYmd = dobRaw.split('T')[0] ?? ''

  const st = typeof raw.status === 'string' && raw.status === 'inactive' ? 'inactive' : 'active'

  return {
    id: String(raw.id ?? ''),
    first_name: String(raw.first_name ?? ''),
    last_name: String(raw.last_name ?? ''),
    date_of_birth: dobYmd || dobRaw,
    age: ageFromDobYmd(raw.date_of_birth != null ? String(raw.date_of_birth) : null),
    gender: raw.gender != null ? String(raw.gender) : null,
    class: raw.class != null ? String(raw.class) : null,
    phone_number: typeof raw.phone_number === 'string' ? raw.phone_number : '',
    email_address: typeof raw.email_address === 'string' ? raw.email_address : '',
    emergency_contact_name: typeof raw.emergency_contact_name === 'string' ? raw.emergency_contact_name : '',
    emergency_phone: typeof raw.emergency_phone === 'string' ? raw.emergency_phone : '',
    representative_1_name: raw.representative_1_name != null ? String(raw.representative_1_name) : null,
    representative_1_relationship:
      raw.representative_1_relationship != null ? String(raw.representative_1_relationship) : null,
    representative_1_phone: raw.representative_1_phone != null ? String(raw.representative_1_phone) : null,
    representative_2_name: raw.representative_2_name != null ? String(raw.representative_2_name) : null,
    representative_2_relationship:
      raw.representative_2_relationship != null ? String(raw.representative_2_relationship) : null,
    representative_2_phone: raw.representative_2_phone != null ? String(raw.representative_2_phone) : null,
    status: st,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString(),
    patients_representatives: representatives,
  }
}
