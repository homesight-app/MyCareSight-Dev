import { z } from 'zod'

export const applicationSchema = z.object({
  application_name: z.string().min(1, 'Application name is required').min(3, 'Application name must be at least 3 characters'),
  state: z.string().min(1, 'State is required'),
})

export type ApplicationFormData = z.infer<typeof applicationSchema>
