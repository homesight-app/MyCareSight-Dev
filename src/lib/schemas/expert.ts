import { z } from 'zod'
import { phoneZodField } from '@/lib/validation'

export const expertSchema = z.object({
  firstName: z.string().min(1, 'First name is required').min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(1, 'Last name is required').min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: phoneZodField,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Please confirm your password'),
  expertise: z.string().optional(),
  role: z.string().optional(),
  status: z.enum(['active', 'inactive']),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

export type ExpertFormData = z.infer<typeof expertSchema>
