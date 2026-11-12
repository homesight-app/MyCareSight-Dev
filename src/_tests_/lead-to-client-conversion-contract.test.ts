/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { leadConversionSchema } from '@/lib/schemas/patient-lead'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('lead-to-client intake conversion contract', () => {
  const action = read('src/app/actions/leads.ts')
  const leadDetail = read('src/components/LeadDetailContent.tsx')
  const clientsPage = read('src/app/pages/agency/clients/page.tsx')
  const detailsSchema = read('src/lib/schemas/patient-lead.ts')
  const leadQueries = read('src/lib/supabase/query/leads.ts')

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
    expect(action).not.toMatch(/emergency_phone, status, start_date/)
  })

  test('archives converted leads and enforces read-only history', () => {
    expect(action).toContain("status = 'archived'")
    expect(action).toContain('Converted leads are read-only')
    expect(action).toContain('requireMutableLead')
    expect(leadDetail).toContain('Converted lead — read only')
    expect(leadDetail).toContain('!isConverted && (')
    expect(leadDetail).toContain('Manage ongoing information from the converted record.')
    expect(leadQueries).toContain("l.status = 'active' AND l.converted_at IS NULL")
    expect(leadQueries).toContain("(l.status = 'archived' OR l.converted_at IS NOT NULL)")
  })

  test('lead qualification schema excludes clinical and insurance fields', () => {
    const leadDetailsSchema = detailsSchema.slice(
      detailsSchema.indexOf('patientLeadDetailsSchema'),
      detailsSchema.indexOf('export type PatientLeadDetailsFormData')
    )
    expect(leadDetailsSchema).not.toMatch(/medicalConditions|cognitiveStatus|insurancePolicyNumber|dateOfBirth/)
  })

  test('conversion accepts dropdown state names and rejects unknown states', () => {
    const valid = leadConversionSchema.safeParse({
      leadId: '11111111-1111-4111-8111-111111111111',
      firstName: 'Synthetic',
      lastName: 'Prospect',
      phone: '(555) 555-0100',
      email: 'synthetic.prospect@example.test',
      streetAddress: '123 Main',
      city: 'Oceanside',
      state: 'California',
      zipCode: '92056',
    })
    const invalid = leadConversionSchema.safeParse({
      leadId: '11111111-1111-4111-8111-111111111111',
      firstName: 'Synthetic',
      lastName: 'Prospect',
      state: 'Not a state',
    })

    expect(valid.success).toBe(true)
    expect(invalid.success).toBe(false)
  })
})
