import { z } from 'zod'

const optionalDate = z.union([z.iso.date(), z.literal(''), z.null()])
  .optional()
  .transform(value => value || null)

export const caregiverCredentialInputSchema = z.object({
  staffMemberId: z.uuid(),
  credentialId: z.uuid().optional(),
  licenseType: z.string().trim().min(1, 'Certification type is required.').max(120),
  licenseNumber: z.string().trim().min(1, 'Certification number is required.').max(120),
  state: z.string().trim().max(100).default(''),
  issueDate: optionalDate,
  expiryDate: optionalDate,
  issuingAuthority: z.string().trim().max(200).default(''),
}).strict()

export type CaregiverCredentialInput = z.input<typeof caregiverCredentialInputSchema>
