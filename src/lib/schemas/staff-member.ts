import { z } from 'zod'
import { phoneZodField } from '@/lib/validation'

export const staffMemberSchema = z.object({
  first_name: z.string().min(1, 'First name is required').min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(1, 'Last name is required').min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: phoneZodField,
  role: z.string().min(1, 'Role is required'),
  job_title: z.string().optional(),
  status: z.enum(['active', 'inactive', 'pending']),
  employee_id: z.string().optional(),
  start_date: z.string().optional(),
})

export type StaffMemberFormData = z.infer<typeof staffMemberSchema>
