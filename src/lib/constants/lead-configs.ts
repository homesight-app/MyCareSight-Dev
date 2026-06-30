export const LEAD_STAGES = [
  { key: 'new',           label: 'New',           color: 'bg-gray-100 text-gray-600' },
  { key: 'contacted',     label: 'Contacted',     color: 'bg-blue-100 text-blue-700' },
  { key: 'proposal_sent', label: 'Proposal Sent', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'verbal',        label: 'Verbal',        color: 'bg-yellow-100 text-yellow-700' },
  { key: 'probable',      label: 'Probable',      color: 'bg-orange-100 text-orange-700' },
  { key: 'signed',        label: 'Signed',        color: 'bg-green-100 text-green-700' },
  { key: 'on_hold',       label: 'On Hold',       color: 'bg-gray-100 text-gray-500' },
  { key: 'lost',          label: 'Lost',          color: 'bg-red-100 text-red-600' },
] as const

export type LeadStageKey = typeof LEAD_STAGES[number]['key']

export const AGENCY_SERVICE_TYPES = [
  { key: 'non_skilled',           label: 'Non-Skilled' },
  { key: 'skilled_achc',          label: 'Skilled; ACHC Accred' },
  { key: 'nurse_registry',        label: 'Nurse Registry' },
  { key: 'plan_of_correction',     label: 'Plan of Correction' },
  { key: 'license_renewal',        label: 'License Renewal' },
  { key: 'mock_survey',            label: 'Mock Survey' },
  { key: 'skilled_chap',           label: 'Skilled; CHAP Accredited' },
  { key: 'homemaker_companion',    label: 'Homemaker Companion' },
  { key: 'policies',               label: 'Policies' },
  { key: 'licensure_changes',      label: 'Licensure Changes' },
  { key: 'emergency_plan',  label: 'Emergency Plan' },
  { key: 'other',     label: 'Other' },
]

export const PATIENT_SERVICE_TYPES = [
  { key: 'companion',       label: 'Companion Care' },
  { key: 'personal_care',   label: 'Personal Care' },
  { key: 'skilled_nursing', label: 'Skilled Nursing' },
  { key: 'therapy',         label: 'Therapy' },
  { key: 'other',           label: 'Other' },
]

export const NOTE_TYPES = [
  { key: 'call',    label: 'Call' },
  { key: 'email',   label: 'Email' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'general', label: 'Note' },
]

export interface LeadContext {
  leadType: 'agency' | 'patient'
  agencyId?: string
  listPath: string
  detailPath: string
  serviceTypes: { key: string; label: string }[]
  conversionLabel: string
  conversionAction: 'agency' | 'patient' | null
  billingVisible: boolean
  canAssign: boolean
  hipaaProtected: boolean
}

export const ADMIN_LEAD_CONTEXT: LeadContext = {
  leadType: 'agency',
  listPath: '/pages/admin/leads',
  detailPath: '/pages/admin/leads',
  serviceTypes: AGENCY_SERVICE_TYPES,
  conversionLabel: 'Convert to Agency',
  conversionAction: 'agency',
  billingVisible: true,
  canAssign: true,
  hipaaProtected: false,
}

export const AGENCY_LEAD_CONTEXT: LeadContext = {
  leadType: 'patient',
  listPath: '/pages/agency/leads',
  detailPath: '/pages/agency/leads',
  serviceTypes: PATIENT_SERVICE_TYPES,
  conversionLabel: 'Convert to Patient',
  conversionAction: 'patient',
  billingVisible: false,
  canAssign: false,
  hipaaProtected: true,
}
