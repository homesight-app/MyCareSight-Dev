import { z } from 'zod'

const skillName = z.string().trim().min(1, 'Skill names cannot be blank.').max(200)

export const patientCaregiverSkillsSchema = z
  .object({
    patientId: z.uuid(),
    requiredSkills: z.array(skillName).max(100, 'Select no more than 100 required skills.'),
    preferredSkills: z.array(skillName).max(100, 'Select no more than 100 preferred skills.'),
  })
  .strict()
  .transform(value => ({
    ...value,
    requiredSkills: Array.from(new Set(value.requiredSkills)).sort((a, b) => a.localeCompare(b)),
    preferredSkills: Array.from(new Set(value.preferredSkills)).sort((a, b) => a.localeCompare(b)),
  }))
  .superRefine((value, context) => {
    const required = new Set(value.requiredSkills)
    if (value.preferredSkills.some(skill => required.has(skill))) {
      context.addIssue({
        code: 'custom',
        path: ['preferredSkills'],
        message: 'A skill cannot be both required and preferred.',
      })
    }
  })

export type PatientCaregiverSkillsInput = z.input<typeof patientCaregiverSkillsSchema>
export type PatientCaregiverSkills = z.output<typeof patientCaregiverSkillsSchema>
