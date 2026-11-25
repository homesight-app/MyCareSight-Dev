import { z } from 'zod'
import { optionalEmailZodField, phoneZodField } from '@/lib/validation'
import { usStateField } from '@/lib/schemas/us-state'

export const branchFormSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Name is required').max(120),
  timezone: z.string().trim().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true } catch { return false }
  }, 'Choose a valid time zone'),
  street_address: z.string().trim().max(300),
  city: z.string().trim().max(100),
  state: usStateField,
  zip_code: z.string().trim().max(10),
  phone: phoneZodField,
  email: optionalEmailZodField,
})

export type BranchFormData = z.infer<typeof branchFormSchema>

export const programBranchRequestSchema = z.object({
  requestId: z.uuid(),
  playbook_id: z.uuid(),
  state: z.string().trim().min(1).max(100),
  branchIds: z.array(z.uuid()).min(1, 'Choose at least one branch').max(100),
}).refine(value => new Set(value.branchIds).size === value.branchIds.length, { path: ['branchIds'], message: 'Choose each branch once' })

export const branchAssignmentSchema = z.object({
  kind: z.enum(['lead', 'client', 'application']),
  recordId: z.uuid(),
  branchIds: z.array(z.uuid()).min(1, 'Choose at least one branch').max(100),
}).superRefine((value, ctx) => {
  if (new Set(value.branchIds).size !== value.branchIds.length) ctx.addIssue({ code: 'custom', path: ['branchIds'], message: 'Choose each branch once' })
  if (value.kind !== 'application' && value.branchIds.length !== 1) ctx.addIssue({ code: 'custom', path: ['branchIds'], message: 'Choose exactly one branch' })
})
