import { z } from 'zod'

const uniqueUuidArray = z.array(z.uuid()).max(100).transform(values => Array.from(new Set(values)))

export const skillCatalogSearchSchema = z.object({
  query: z.string().trim().max(100).default(''),
  categoryId: z.uuid().nullable().optional(),
  offset: z.number().int().min(0).max(10_000).default(0),
  limit: z.number().int().min(1).max(50).default(25),
  includeInactive: z.boolean().default(false),
}).strict()

export const skillCatalogCreateSchema = z.object({
  name: z.string().trim().min(2, 'Enter a skill name.').max(120),
  categoryId: z.uuid('Select a skill category.'),
  serviceType: z.enum(['skilled', 'non_skilled']).nullable(),
}).strict()

export const skillCatalogUpdateSchema = z.object({
  skillId: z.uuid(),
  name: z.string().trim().min(2, 'Enter a skill name.').max(120),
  categoryId: z.uuid('Select a skill category.'),
  serviceType: z.enum(['skilled', 'non_skilled']).nullable(),
  isActive: z.boolean(),
}).strict()

export const caregiverSkillSaveSchema = z.object({
  caregiverMemberId: z.uuid(),
  skillIds: uniqueUuidArray,
}).strict()

export const patientSkillIdRequirementsSchema = z.object({
  patientId: z.uuid(),
  requiredSkillIds: uniqueUuidArray,
  preferredSkillIds: uniqueUuidArray,
}).strict().superRefine((value, context) => {
  const required = new Set(value.requiredSkillIds)
  if (value.preferredSkillIds.some(id => required.has(id))) {
    context.addIssue({
      code: 'custom',
      path: ['preferredSkillIds'],
      message: 'A skill cannot be both required and preferred.',
    })
  }
})

export type SkillCatalogSearchInput = z.input<typeof skillCatalogSearchSchema>
export type SkillCatalogCreateInput = z.input<typeof skillCatalogCreateSchema>
export type SkillCatalogUpdateInput = z.input<typeof skillCatalogUpdateSchema>
export type CaregiverSkillSaveInput = z.input<typeof caregiverSkillSaveSchema>
export type PatientSkillIdRequirementsInput = z.input<typeof patientSkillIdRequirementsSchema>

