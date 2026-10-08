/** @jest-environment node */
import sql from '@/db'
import { getCasesOrderedByStartedDate } from '@/lib/supabase/query/cases'
import { getCaregiverAvailabilitySlots } from '@/lib/supabase/query/caregiver-availability'
import { getLeads, getLeadsByAgency } from '@/lib/supabase/query/leads'
import { getAgencyCertificationsWithHistory } from '@/lib/supabase/query/licenses'
import { getStaffMemberByIdAndAgencyId } from '@/lib/supabase/query/users'
import { getApplicationById } from '@/lib/supabase/query/applications'
import { getApplicationPlaybookItems } from '@/lib/supabase/query/playbooks'
import { getScheduledVisitsAsScheduleRowsForAgencyAndDateRange } from '@/lib/supabase/query/schedules'
import { mapInsertedPatientToListPatient } from '@/lib/map-inserted-patient-to-list-row'
import { normalizeTimeBillingVisitRow } from '@/lib/time-billing-date-contract'

jest.mock('@/db', () => ({ __esModule: true, default: jest.fn() }))

const mockSql = sql as unknown as jest.Mock

describe('date query boundaries', () => {
  afterEach(() => jest.clearAllMocks())

  it('serializes lead calendar dates and timestamps', async () => {
    const rows = [{
      id: 'synthetic-lead', signed_date: new Date('2026-09-30T00:00:00.000Z'),
      retainer_paid_date: new Date('2026-09-29T00:00:00.000Z'),
      proposal_sent_date: null, converted_at: new Date('2026-09-30T14:00:00.000Z'),
      created_at: new Date('2026-09-28T14:00:00.000Z'),
      updated_at: new Date('2026-09-30T14:00:00.000Z'), lead_owner_id_ref: null,
      price: '10000.50', retainer_amount: '2500.25', installments: 2, installment_amount: '3750.125',
    }]
    mockSql.mockImplementation((parts: TemplateStringsArray) =>
      parts.join('').includes('SELECT') ? Promise.resolve(rows) : [])

    const result = await getLeads({ leadType: 'agency' })
    expect(result.data?.[0]).toMatchObject({
      signed_date: '2026-09-30', retainer_paid_date: '2026-09-29',
      proposal_sent_date: null, converted_at: '2026-09-30T14:00:00.000Z',
      price: 10000.5, retainer_amount: 2500.25, installments: 2, installment_amount: 3750.125,
    })
  })

  it('normalizes agency lead financial values before summary calculations', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-agency-lead', stage: 'signed',
      price: '9000.00', retainer_amount: '2500.00', retainer_paid_date: new Date('2026-10-03T00:00:00.000Z'),
      installment_amount: null, signed_date: new Date('2026-10-03T00:00:00.000Z'),
      converted_at: new Date('2026-10-03T12:00:00.000Z'), created_at: new Date('2026-09-01T12:00:00.000Z'),
    }])

    const result = await getLeadsByAgency('synthetic-agency')
    expect(result.data?.[0]).toMatchObject({
      price: 9000,
      retainer_amount: 2500,
      retainer_paid_date: '2026-10-03',
      signed_date: '2026-10-03',
    })
  })

  it('serializes certification dates used by sorting and forms', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-license', activated_date: new Date('2026-01-01T00:00:00.000Z'),
      expiry_date: new Date('2027-01-01T00:00:00.000Z'), renewal_due_date: null,
      first_issued_date: new Date('2025-01-01T00:00:00.000Z'),
      created_at: new Date('2026-01-01T08:00:00.000Z'),
      updated_at: new Date('2026-01-02T08:00:00.000Z'),
      certification_applications: [], license_documents: [],
    }])

    const result = await getAgencyCertificationsWithHistory('synthetic-agency')
    expect(result.data?.[0]).toMatchObject({
      activated_date: '2026-01-01', expiry_date: '2027-01-01',
      first_issued_date: '2025-01-01', renewal_due_date: null,
    })
  })

  it('serializes billing case dates', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-case', started_date: new Date('2026-09-01T00:00:00.000Z'),
      last_activity: new Date('2026-09-30T10:00:00.000Z'),
      created_at: new Date('2026-09-01T10:00:00.000Z'),
      updated_at: new Date('2026-09-30T10:00:00.000Z'),
    }])

    const result = await getCasesOrderedByStartedDate()
    expect(result.data?.[0]).toMatchObject({
      started_date: '2026-09-01', last_activity: '2026-09-30T10:00:00.000Z',
    })
  })

  it('serializes availability recurrence dates', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-slot', caregiver_member_id: 'synthetic-caregiver', agency_id: null,
      label: null, is_recurring: true, start_time: '09:00:00', end_time: '17:00:00',
      repeat_frequency: 'weekly', days_of_week: [1],
      repeat_start: new Date('2026-09-01T00:00:00.000Z'),
      repeat_end: new Date('2026-12-31T00:00:00.000Z'), specific_date: null,
      created_at: new Date('2026-08-31T20:00:00.000Z'),
      updated_at: new Date('2026-08-31T20:00:00.000Z'),
    }])

    const result = await getCaregiverAvailabilitySlots('synthetic-caregiver')
    expect(result.data?.[0]).toMatchObject({
      repeat_start: '2026-09-01', repeat_end: '2026-12-31', specific_date: null,
      created_at: '2026-08-31T20:00:00.000Z',
    })
  })

  it('serializes caregiver start dates before edit forms receive them', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-caregiver', start_date: new Date('2026-02-03T00:00:00.000Z'),
      created_at: new Date('2026-01-01T08:00:00.000Z'),
      updated_at: new Date('2026-02-03T08:00:00.000Z'),
    }])

    const result = await getStaffMemberByIdAndAgencyId('synthetic-caregiver', 'synthetic-agency')
    expect(result.data).toMatchObject({
      start_date: '2026-02-03', created_at: '2026-01-01T08:00:00.000Z',
    })
  })

  it('serializes program dates before the detail client component receives them', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-application',
      started_date: new Date('2026-01-02T00:00:00.000Z'),
      last_updated_date: new Date('2026-02-03T00:00:00.000Z'),
      submitted_date: null,
      issue_date: new Date('2026-03-04T00:00:00.000Z'),
      expiry_date: new Date('2027-03-04T00:00:00.000Z'),
      created_at: new Date('2026-01-02T08:00:00.000Z'),
      updated_at: new Date('2026-02-03T08:00:00.000Z'),
      closed_at: null,
      completed_at: new Date('2026-03-05T08:00:00.000Z'),
    }])

    const result = await getApplicationById('synthetic-application')
    expect(result.data).toMatchObject({
      started_date: '2026-01-02',
      last_updated_date: '2026-02-03',
      submitted_date: null,
      issue_date: '2026-03-04',
      expiry_date: '2027-03-04',
      created_at: '2026-01-02T08:00:00.000Z',
      updated_at: '2026-02-03T08:00:00.000Z',
      closed_at: null,
      completed_at: '2026-03-05T08:00:00.000Z',
    })
  })

  it('serializes a program item due date before React renders it as text', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-item',
      application_id: 'synthetic-application',
      due_date: new Date('2026-10-15T00:00:00.000Z'),
      approved_at: new Date('2026-10-14T18:00:00.000Z'),
      created_at: new Date('2026-10-01T18:00:00.000Z'),
      updated_at: new Date('2026-10-14T18:00:00.000Z'),
    }])

    const result = await getApplicationPlaybookItems('synthetic-application')
    expect(result.data?.[0]).toMatchObject({
      due_date: '2026-10-15',
      approved_at: '2026-10-14T18:00:00.000Z',
      created_at: '2026-10-01T18:00:00.000Z',
      updated_at: '2026-10-14T18:00:00.000Z',
    })
  })

  it('serializes scheduled-visit dates before care-visit timezone conversion', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-visit',
      agency_id: 'synthetic-agency',
      patient_id: 'synthetic-patient',
      caregiver_member_id: null,
      contract_id: null,
      service_type: 'non_skilled',
      visit_date: new Date('2026-10-07T00:00:00.000Z'),
      scheduled_start_time: '12:00:00',
      scheduled_end_time: '13:00:00',
      scheduled_end_date: new Date('2026-10-07T00:00:00.000Z'),
      description: null,
      notes: null,
      status_reason: null,
      visit_type: null,
      status: 'scheduled',
      is_recurring: false,
      created_at: new Date('2026-10-01T18:00:00.000Z'),
      updated_at: new Date('2026-10-07T18:00:00.000Z'),
      patient_address_id: null,
      mileage_miles: null,
      patient_address: null,
      scheduled_visit_tasks: [],
      visit_series: null,
    }])

    const result = await getScheduledVisitsAsScheduleRowsForAgencyAndDateRange(
      'synthetic-agency',
      '2026-10-01',
      '2026-10-31'
    )

    expect(result.error).toBeNull()
    expect(result.data?.[0]).toMatchObject({
      date: '2026-10-07',
      end_date: '2026-10-07',
      created_at: '2026-10-01T18:00:00.000Z',
      updated_at: '2026-10-07T18:00:00.000Z',
    })
  })

  it('serializes completed-visit dates before the time-billing client renders them', () => {
    const result = normalizeTimeBillingVisitRow({
      id: 'synthetic-visit',
      patient_id: 'synthetic-patient',
      caregiver_member_id: 'synthetic-caregiver',
      visit_date: new Date('2026-10-08T00:00:00.000Z'),
      scheduled_start_time: '09:00:00',
      scheduled_end_time: '11:00:00',
      scheduled_end_date: new Date('2026-10-08T00:00:00.000Z'),
      service_type: 'non_skilled',
      mileage_miles: 4.5,
    })

    expect(result).toMatchObject({
      visit_date: '2026-10-08',
      scheduled_end_date: '2026-10-08',
    })
  })

  it('maps a newly inserted patient with driver-shaped dates', () => {
    const result = mapInsertedPatientToListPatient({
      id: 'synthetic-patient', first_name: 'Synthetic', last_name: 'Patient',
      date_of_birth: new Date('1980-04-05T00:00:00.000Z'),
      created_at: new Date('2026-09-30T08:00:00.000Z'),
      patients_representatives: [],
    })

    expect(result).toMatchObject({
      date_of_birth: '1980-04-05', created_at: '2026-09-30T08:00:00.000Z',
    })
    expect(result.age).not.toBeNull()
  })
})
