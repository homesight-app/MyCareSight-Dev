/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('lead-to-client intake conversion contract', () => {
  const action = read('src/app/actions/leads.ts')
  const leadDetail = read('src/components/LeadDetailContent.tsx')
  const clientsPage = read('src/app/pages/agency/clients/page.tsx')
  const detailsSchema = read('src/lib/schemas/patient-lead.ts')

  test('does not put lead PHI into the clients URL', () => {
    expect(leadDetail).not.toMatch(/clients\?lead=.*firstName/)
    expect(clientsPage).not.toContain('firstName?: string')
    expect(clientsPage).not.toContain('dateOfBirth?: string')
  })

  test('uses one tenant-scoped conversion transaction with audit and intake status', () => {
    expect(action).toContain('convertPatientLeadToClientAction')
    expect(action).toContain('withUserContext')
    expect(action).toContain("'CONVERT_TO_CLIENT'")
    expect(action).toContain("'', '', 'pending'")
    expect(action).toContain('FOR UPDATE')
  })

  test('lead qualification schema excludes clinical and insurance fields', () => {
    const leadDetailsSchema = detailsSchema.slice(
      detailsSchema.indexOf('patientLeadDetailsSchema'),
      detailsSchema.indexOf('export type PatientLeadDetailsFormData')
    )
    expect(leadDetailsSchema).not.toMatch(/medicalConditions|cognitiveStatus|insurancePolicyNumber|dateOfBirth/)
  })
})
