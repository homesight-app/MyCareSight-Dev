export type SkillScope = 'system' | 'agency'
export type SkillVerificationStatus = 'self_reported' | 'verified'

export type SkillCatalogOption = {
  id: string
  code: string
  name: string
  categoryId: string | null
  categoryName: string
  serviceType: 'skilled' | 'non_skilled' | null
  scope: SkillScope
  agencyId: string | null
  isActive: boolean
}

export type CaregiverSkillSelection = SkillCatalogOption & {
  verificationStatus: SkillVerificationStatus
}

export type PatientSkillSelection = SkillCatalogOption & {
  requirementLevel: 'required' | 'preferred'
}

