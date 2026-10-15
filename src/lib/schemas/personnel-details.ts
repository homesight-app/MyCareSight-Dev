import { z } from 'zod'

const optionalDate = z.union([z.literal(''), z.iso.date()]).default('')
const optionalText = (max: number) => z.string().trim().max(max).default('')

export const personnelDetailsSchema = z.object({
  birth_date: optionalDate,
  hire_date: optionalDate,
  ssn: z.string().trim().regex(/^$|^\d{3}-?\d{2}-?\d{4}$/, 'Enter a valid 9-digit SSN').default(''),
  ssn_action: z.enum(['keep', 'replace', 'clear']).default('keep'),
  home_address_street: optionalText(200),
  home_address_city: optionalText(100),
  home_address_state: z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2}$/, 'Use a two-letter state code').default(''),
  home_address_zip: z.string().trim().regex(/^$|^\d{5}(?:-\d{4})?$/, 'Enter a valid ZIP code').default(''),
}).strict().superRefine((value, context) => {
  const today = new Date().toISOString().slice(0, 10)
  if (value.birth_date && value.birth_date > today) {
    context.addIssue({ code: 'custom', path: ['birth_date'], message: 'Birth date cannot be in the future' })
  }
  if (value.ssn_action === 'replace' && !value.ssn) {
    context.addIssue({ code: 'custom', path: ['ssn'], message: 'Enter the complete SSN' })
  }
})

export type PersonnelDetailsInput = z.input<typeof personnelDetailsSchema>
export type PersonnelDetails = z.output<typeof personnelDetailsSchema>

export const personnelTargetSchema = z.object({
  agencyId: z.uuid(),
  userProfileId: z.uuid().optional(),
  caregiverMemberId: z.uuid().optional(),
}).strict().refine(
  target => Number(Boolean(target.userProfileId)) + Number(Boolean(target.caregiverMemberId)) === 1,
  'Select exactly one personnel record'
)

export type PersonnelTarget = z.input<typeof personnelTargetSchema>
