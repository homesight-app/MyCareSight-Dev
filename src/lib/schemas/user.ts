import { z } from 'zod'
import { emailZodField } from '@/lib/validation'

export const AGENCY_ROLES = ['company_owner', 'staff_member', 'care_coordinator']

export const addUserSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').min(2, 'Full name must be at least 2 characters'),
  email: emailZodField,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  role: z.string(),
  agency_id: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
}).superRefine((data, ctx) => {
  if (AGENCY_ROLES.includes(data.role) && !data.agency_id?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select an agency', path: ['agency_id'] })
  }
})

export type AddUserFormData = z.infer<typeof addUserSchema>
