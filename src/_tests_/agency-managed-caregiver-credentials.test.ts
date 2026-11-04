/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { caregiverCredentialInputSchema } from '@/lib/schemas/caregiver-credential'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('agency-managed caregiver credentials', () => {
  const migration = read('scripts/migrations/040-agency-managed-caregiver-credentials.sql')
  const verifier = read('scripts/migrations/040-verify-agency-managed-caregiver-credentials.sql')
  const caregiverPage = read('src/app/pages/caregiver/my-certifications/page.tsx')
  const skillActions = read('src/app/actions/skills.ts')
  const certificationActions = read('src/app/actions/caregiver-licenses.ts')

  test('migration auto-verifies pending synthetic skills and removes caregiver write policies', () => {
    const skillPolicySection = migration.split('ALTER TABLE public.caregiver_credentials ENABLE ROW LEVEL SECURITY')[0]
    expect(migration).toContain("WHERE assignment.verification_status = 'self_reported'")
    expect(migration).toContain("SET verification_status = 'verified'")
    expect(migration).toContain('caregiver_skill_assignments_manager_insert')
    expect(skillPolicySection).not.toContain('skill_actor_is_caregiver')
    expect(verifier).toContain('caregiver_has_no_skill_write_policy')
  })

  test('caregiver certifications retain self-read but manager-only writes', () => {
    expect(migration).toContain('ALTER TABLE public.caregiver_credentials FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('caregiver_credentials_select')
    expect(migration).toContain('public.skill_actor_is_caregiver(agency_id, caregiver_member_id)')
    expect(migration).toContain('caregiver_credentials_manager_insert')
    expect(migration).toContain('caregiver_credentials_manager_update')
    expect(migration).toContain('caregiver_credentials_manager_delete')
    expect(verifier).toContain('caregiver_has_no_credential_write_policy')
  })

  test('caregiver page is read-only and explains the manager workflow', () => {
    expect(caregiverPage).not.toContain('EditCaregiverSkillsModal')
    expect(caregiverPage).not.toContain('AddCertificationModal')
    expect(caregiverPage).not.toContain('EditCertificationModal')
    expect(caregiverPage).toContain('Skills and certifications are maintained by your agency')
  })

  test('skill writes and certification writes require manager authorization', () => {
    const readAction = skillActions
      .split('export async function getCaregiverSkillsAction')[1]
      .split('export async function saveCaregiverSkillsAction')[0]
    const writeAction = skillActions
      .split('export async function saveCaregiverSkillsAction')[1]
      .split('export async function createSystemSkillAction')[0]
    expect(readAction).toContain("if (!manager && !self) throw new Error('Forbidden')")
    expect(writeAction).toContain("if (!manager) throw new Error('Forbidden')")
    expect(writeAction).not.toContain('actor.role === \'staff_member\'')
    expect(writeAction).not.toContain('caregiver_replace_self_reported_skills')
    expect(certificationActions).toContain("role IN ('company_owner', 'care_coordinator')")
    expect(certificationActions).toContain("assertAgencyCapability(target.agency_id, 'caregiver_management')")
    expect(certificationActions).toContain('manager_add_caregiver_credential')
    expect(certificationActions).toContain('manager_update_caregiver_credential')
  })

  test('manager certification input rejects invalid identifiers and missing required fields', () => {
    expect(caregiverCredentialInputSchema.safeParse({
      staffMemberId: 'not-a-uuid',
      licenseType: '',
      licenseNumber: '',
      state: '',
      issueDate: '',
      expiryDate: '',
      issuingAuthority: '',
    }).success).toBe(false)

    expect(caregiverCredentialInputSchema.safeParse({
      staffMemberId: '40000000-0000-4000-8000-000000000001',
      licenseType: 'Synthetic Certification',
      licenseNumber: 'SYNTHETIC-001',
      state: 'CA',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      issuingAuthority: 'Synthetic Authority',
    }).success).toBe(true)
  })
})
