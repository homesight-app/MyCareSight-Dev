/**
 * Expert process step phases. Used for phase select options in Add/Edit Expert Step modals
 * and for ordering phase groups when displaying expert steps.
 */

export const EXPERT_STEP_PHASES: { value: string; label: string }[] = [
  { value: 'Client Intake', label: 'Client Intake' },
  { value: 'Application Preparation', label: 'Application Preparation' },
  { value: 'Application Submission', label: 'Application Submission' },
  { value: 'Survey Preparation', label: 'Survey Preparation' },
  { value: 'Survey Guidance', label: 'Survey Guidance' },
]

export const DEFAULT_EXPERT_STEP_PHASE: string = EXPERT_STEP_PHASES[0].value

/** One source for US state dropdowns and legacy address abbreviations. */
export const US_STATE_NAMES_BY_CODE: Readonly<Record<string, string>> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

/** Existing consumers retain the same alphabetical names and string[] API. */
export const US_STATES: string[] = Object.values(US_STATE_NAMES_BY_CODE)

/** Recognized legacy abbreviations/names normalize without hiding unknown values. */
export function normalizeUSState(value: string): string {
  const trimmed = value.trim()
  return (Object.hasOwn(US_STATE_NAMES_BY_CODE, trimmed.toUpperCase()) ? US_STATE_NAMES_BY_CODE[trimmed.toUpperCase()] : undefined)
    ?? US_STATES.find(name => name.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
}

/**
 * Activities of Daily Living (ADL) library. Used for patient_adls.adl_code and scheduled_visit_tasks.legacy_task_code.
 * Store the `name` value in the database; use these constants for options and validation.
 */
export const ADL_LISTS: { name: string; group: string }[] = [
  { name: 'Ambulating', group: 'ADL' },
  { name: 'Feeding', group: 'ADL' },
  { name: 'Dressing', group: 'ADL' },
  { name: 'Personal Hygiene', group: 'ADL' },
  { name: 'Continenece', group: 'ADL' },
  { name: 'Toileting', group: 'ADL' },

  { name: 'Transportation', group: 'IADL' },
  { name: 'Managing Finances', group: 'IADL' },
  { name: 'Shopping', group: 'IADL' },
  { name: 'Meal Preparation', group: 'IADL' },
  { name: 'Housecleaning and Home Maintenance', group: 'IADL' },
  { name: 'Managing Communication with Others', group: 'IADL' },
  { name: 'Managing Medications', group: 'IADL' },
]

/**
 * Caregiver skills and certifications. Used for caregiver_requirements.skill_codes.
 * Store the `name` value in the database; use these constants for options and validation.
 */
export const CAREGIVER_SKILL_POINTS: { type: string; name: string }[] = [
  { type: 'Clinical Care', name: 'Wound Care' },
  { type: 'Clinical Care', name: 'Catheter Care' },
  { type: 'Clinical Care', name: 'Ostomy Care' },
  { type: 'Clinical Care', name: 'Feeding Tube Care' },
  { type: 'Clinical Care', name: 'Tracheostomy Care' },
  { type: 'Clinical Care', name: 'Oxygen Therapy' },
  { type: 'Clinical Care', name: 'IV Therapy' },
  { type: 'Clinical Care', name: 'Insulin Administration' },
  { type: 'Clinical Care', name: 'Vital Signs Monitoring' },
  { type: 'Clinical Care', name: 'Dialysis Support' },
  { type: 'Specialty Conditions', name: "Alzheimer's / Dementia Care" },
  { type: 'Specialty Conditions', name: "Parkinson's Care" },
  { type: 'Specialty Conditions', name: 'Stroke Care' },
  { type: 'Specialty Conditions', name: 'Multiple Sclerosis Care' },
  { type: 'Specialty Conditions', name: 'ALS Care' },
  { type: 'Specialty Conditions', name: 'Traumatic Brain Injury Care' },
  { type: 'Specialty Conditions', name: 'Hospice / Palliative Care' },
  { type: 'Specialty Conditions', name: 'Post-Surgery Recovery' },
  { type: 'Specialty Conditions', name: 'Diabetic Care' },
  { type: 'Specialty Conditions', name: 'Pediatric Care' },
  { type: 'Specialty Conditions', name: 'Autism Spectrum Care' },
  { type: 'Specialty Conditions', name: 'Behavioral Health Support' },
  { type: 'Physical Support', name: 'Transfer & Mobility Assistance' },
  { type: 'Physical Support', name: 'Fall Prevention' },
  { type: 'Physical Support', name: 'Physical Therapy Assistance' },
  { type: 'Physical Support', name: 'Occupational Therapy Assistance' },
  { type: 'Daily Living', name: 'Meal Preparation' },
  { type: 'Daily Living', name: 'Housekeeping' },
  { type: 'Daily Living', name: 'Medication Reminders' },
  { type: 'Daily Living', name: 'Companionship' },
  { type: 'Daily Living', name: 'Transportation' },
  { type: 'Certifications', name: 'CPR Certified' },
  { type: 'Certifications', name: 'AED Certified' },
  { type: 'Certifications', name: 'First Aid Certified' },
  { type: 'Language', name: 'Bilingual — Spanish' },
  { type: 'Language', name: 'Bilingual — French' },
  { type: 'Language', name: 'Bilingual — Mandarin' },
  { type: 'Language', name: 'Bilingual — Portuguese' },
  { type: 'Language', name: 'American Sign Language (ASL)' },
]
