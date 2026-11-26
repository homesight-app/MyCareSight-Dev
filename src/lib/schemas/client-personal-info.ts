import { z } from 'zod'

export const clientPersonalInfoSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.'),
  last_name: z.string().trim(),
  gender: z.string(),
  date_of_birth: z.union([z.iso.date('Enter a valid date.'), z.literal('')]),
  branchId: z.uuid('Choose a valid branch.').optional(),
})
export type ClientPersonalInfoData = z.infer<typeof clientPersonalInfoSchema>
