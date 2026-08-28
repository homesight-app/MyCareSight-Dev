import { z } from 'zod'

export const profileSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['company_owner', 'staff_member', 'care_coordinator', 'admin', 'expert']),
})

export type ProfileFormData = z.infer<typeof profileSchema>

export const personalInfoSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  workLocation: z.string().optional(),
  startDate: z.string().optional(),
})

export type PersonalInfoFormData = z.infer<typeof personalInfoSchema>

export const companyDetailsSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  businessType: z.string().min(1, 'Business type is required'),
  taxId: z.string().min(1, 'Tax ID / EIN is required'),
  primaryLicenseNumber: z.string().min(1, 'Primary license number is required'),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  physicalStreetAddress: z.string().min(1, 'Street address is required'),
  physicalCity: z.string().min(1, 'City is required'),
  physicalState: z.string().min(1, 'State is required'),
  physicalZipCode: z.string().min(1, 'ZIP code is required'),
  sameAsPhysical: z.boolean().default(true),
  mailingStreetAddress: z.string().optional(),
  mailingCity: z.string().optional(),
  mailingState: z.string().optional(),
  mailingZipCode: z.string().optional(),
}).refine((data) => {
  if (!data.sameAsPhysical) {
    return data.mailingStreetAddress && data.mailingCity && data.mailingState && data.mailingZipCode
  }
  return true
}, {
  message: 'Mailing address fields are required when not same as physical address',
  path: ['mailingStreetAddress'],
})

export type CompanyDetailsFormInput = z.input<typeof companyDetailsSchema>
export type CompanyDetailsFormOutput = z.output<typeof companyDetailsSchema>
