import { z } from 'zod'
import { phoneZodField, emailZodField } from '@/lib/validation'

export const clientSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  contact_name: z.string().min(1, 'Contact name is required'),
  contact_email: z.string().email('Please enter a valid email address'),
  contact_phone: phoneZodField,
  status: z.enum(['active', 'inactive', 'pending']),
  start_date: z.string().optional(),
})

export type ClientFormData = z.infer<typeof clientSchema>

export const agencyAdminFormSchema = z.object({
  first_name: z.string().min(1, 'First name is required').min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(1, 'Last name is required').min(2, 'Last name must be at least 2 characters'),
  contact_email: emailZodField,
  contact_phone: phoneZodField,
  job_title: z.string().optional(),
  department: z.string().optional(),
  work_location: z.string().min(1, 'Work location is required'),
  status: z.enum(['active', 'inactive', 'pending']),
})

export type AgencyAdminFormData = z.infer<typeof agencyAdminFormSchema>
