import { z } from 'zod'
import { phoneZodField, optionalEmailZodField } from '@/lib/validation'

export const agencyFormSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  agencyAdminIds: z.array(z.string()),
  businessType: z.string(),
  taxId: z.string(),
  primaryLicenseNumber: z.string(),
  website: z.string().optional(),
  physicalStreetAddress: z.string(),
  physicalCity: z.string(),
  physicalState: z.string(),
  physicalZipCode: z.string(),
  sameAsPhysical: z.boolean(),
  mailingStreetAddress: z.string().optional(),
  mailingCity: z.string().optional(),
  mailingState: z.string().optional(),
  mailingZipCode: z.string().optional(),
  // Onboarding / profile extension fields
  dbaName: z.string().optional(),
  hoursOfOperation: z.string().optional(),
  faxNumber: phoneZodField,
  dateOfFormation: z.string().optional(),
  npi: z.string().optional(),
  stateSpecificData: z.record(z.string(), z.unknown()).optional(),
  phoneNumber: phoneZodField,
  agencyEmail: optionalEmailZodField,
  regionServiceArea: z.string().optional(),
  primaryContactFirstName: z.string().optional(),
  primaryContactLastName: z.string().optional(),
  isOnCall: z.boolean().optional(),
  previouslyLicensed: z.boolean().optional(),
  prevLicenseClosedDate: z.string().optional(),
  // Legal entity fields
  legalEntityName: z.string().optional(),
  entityType: z.string().optional(),
  stateOfIncorporation: z.string().optional(),
  dateOfIncorporation: z.string().optional(),
  licensedOfficeStreet: z.string().optional(),
  licensedOfficeCity: z.string().optional(),
  licensedOfficeState: z.string().optional(),
  licensedOfficeZip: z.string().optional(),
  licensedSameAsPhysical: z.boolean().optional(),
})

export type AgencyFormData = z.infer<typeof agencyFormSchema>
