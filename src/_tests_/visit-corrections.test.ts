/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import { correctVisit } from '@/lib/repositories/visit-corrections'
import { decideTimeBillingVisit } from '@/lib/repositories/visit-financial-writes'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/feature-access', () => ({ assertAgencyCapability: jest.fn() }))

let db: PGlite
let failAudit = false

jest.mock('postgres', () => {
  type Executor = Pick<PGlite, 'query'>
  const tag = (executor: () => Executor) => (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings, values,
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      const params: unknown[] = []
      const compile = (part: { strings: readonly string[]; values: unknown[] }): string =>
        part.strings.reduce((out, chunk, index) => {
          if (index === part.values.length) return out + chunk
          const value = part.values[index]
          if (value && typeof value === 'object' && 'strings' in value && 'values' in value) {
            return out + chunk + compile(value as typeof part)
          }
          params.push(value)
          return out + chunk + '$' + params.length
        }, '')
      const query = compile(this)
      if (failAudit && query.includes('INSERT INTO public.audit_log')) {
        return Promise.reject(new Error('synthetic audit outage')).then(resolve, reject)
      }
      return executor().query(query, params).then(result => result.rows).then(resolve, reject)
    },
  })
  const pool = Object.assign(tag(() => db), {
    begin: async (fn: (tx: ReturnType<typeof tag>) => Promise<unknown>) =>
      db.transaction(async tx => fn(tag(() => tx))),
  })
  return { __esModule: true, default: () => pool }
})

const id = (n: number) => `a0000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const USER = id(1), AGENCY = id(2), OTHER = id(3), PATIENT = id(4), CAREGIVER = id(5), VISIT = id(6)

const completion = {
  scheduledVisitId: VISIT,
  expectedStatus: 'missed' as const,
  correctedStatus: 'completed' as const,
  caregiverMemberId: CAREGIVER,
  actualStartAt: '2026-10-19T16:00:00Z',
  actualEndAt: '2026-10-19T20:00:00Z',
  billableHours: 4,
  reason: 'Synthetic caregiver and client confirmation.',
  careVerified: true as const,
}

beforeAll(async () => { db = new PGlite() }, 60000)
afterAll(async () => { await db?.close() })

beforeEach(async () => {
  failAudit = false
  jest.clearAllMocks()
  await db.exec(`
    DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE public.user_profiles(id uuid PRIMARY KEY,role text,agency_id uuid,is_active boolean);
    CREATE TABLE public.user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE public.patients(id uuid PRIMARY KEY,agency_id uuid);
    CREATE TABLE public.caregiver_members(id uuid PRIMARY KEY,agency_id uuid,status text);
    CREATE TABLE public.scheduled_visits(id uuid PRIMARY KEY,agency_id uuid,patient_id uuid,
      caregiver_member_id uuid,service_type text,status text,status_reason text,
      visit_date date DEFAULT '2026-10-19',updated_at timestamptz DEFAULT now());
    CREATE TABLE public.caregiver_pay_rates(caregiver_member_id uuid,pay_rate numeric,unit_type text,
      service_type text,agency_id uuid,effective_start date,effective_end date);
    CREATE TABLE public.patient_service_contracts(id uuid PRIMARY KEY,agency_id uuid,patient_id uuid,
      billing_code_id uuid,bill_rate numeric,bill_unit_type text,service_type text,
      contract_type text,status text,effective_date date,end_date date,
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE public.visit_time_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,
      scheduled_visit_id uuid UNIQUE,patient_id uuid,caregiver_member_id uuid,
      clock_in_time timestamptz,clock_out_time timestamptz,adjusted_start_time timestamptz,
      adjusted_end_time timestamptz,actual_hours numeric,billable_hours numeric,entry_status text,
      adjustment_comment text,updated_at timestamptz DEFAULT now());
    CREATE TABLE public.visit_financials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,
      scheduled_visit_id uuid UNIQUE,visit_time_entry_id uuid,visit_approval_id uuid,patient_id uuid,
      caregiver_member_id uuid,contract_id uuid,billing_code_id uuid,service_type text,status text,approved_actual_hours numeric,
      approved_billable_hours numeric,calculation_basis jsonb,pay_rate numeric,pay_unit_type text,
      pay_amount numeric,bill_rate numeric,bill_unit_type text,bill_amount numeric,updated_at timestamptz DEFAULT now());
    CREATE TABLE public.visit_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,
      scheduled_visit_id uuid,visit_time_entry_id uuid UNIQUE,approval_status text,pay_rate numeric,bill_rate numeric);
    CREATE TABLE public.visit_adjustment_history(agency_id uuid,visit_time_entry_id uuid,
      changed_by_user_id uuid,reason text,previous_actual_hours numeric,current_actual_hours numeric,
      previous_billable_hours numeric,current_billable_hours numeric,note text);
    CREATE TABLE public.visit_corrections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,
      scheduled_visit_id uuid,corrected_by_user_id uuid,previous_status text,corrected_status text,
      reason text,previous_caregiver_member_id uuid,corrected_caregiver_member_id uuid,
      actual_start_time timestamptz,actual_end_time timestamptz,actual_hours numeric,
      billable_hours numeric,previous_financial_status text,created_at timestamptz DEFAULT now());
    CREATE TABLE public.audit_log(agency_id uuid,table_name text,record_id uuid,action text,
      performed_by_user_id uuid,details jsonb);
    INSERT INTO public.user_profiles VALUES ('${USER}','company_owner','${AGENCY}',true);
    INSERT INTO public.user_agency_roles VALUES ('${USER}','${AGENCY}','company_owner','active');
    INSERT INTO public.patients VALUES ('${PATIENT}','${AGENCY}');
    INSERT INTO public.caregiver_members VALUES ('${CAREGIVER}','${AGENCY}','active');
    INSERT INTO public.scheduled_visits(id,agency_id,patient_id,caregiver_member_id,service_type,status)
      VALUES ('${VISIT}','${AGENCY}','${PATIENT}',NULL,'non_skilled','missed');
  `)
  jest.mocked(getSession).mockResolvedValue({
    user: { id: USER }, profile: { role: 'company_owner' },
  } as Awaited<ReturnType<typeof getSession>>)
})

test('manual completion preserves EVV fields and creates pending time and billing atomically', async () => {
  expect(await correctVisit(completion)).toEqual({ ok: true })
  const visit = await db.query<{status:string;caregiver_member_id:string}>(
    'SELECT status,caregiver_member_id FROM scheduled_visits WHERE id=$1', [VISIT])
  expect(visit.rows[0]).toEqual({ status: 'completed', caregiver_member_id: CAREGIVER })
  const time = await db.query<{clock_in_time:string|null;clock_out_time:string|null;actual_hours:string;entry_status:string}>(
    'SELECT clock_in_time,clock_out_time,actual_hours,entry_status FROM visit_time_entries')
  expect(time.rows[0].clock_in_time).toBeNull()
  expect(time.rows[0].clock_out_time).toBeNull()
  expect(Number(time.rows[0].actual_hours)).toBe(4)
  expect(time.rows[0].entry_status).toBe('pending_review')
  const financial = await db.query<{status:string}>('SELECT status FROM visit_financials')
  expect(financial.rows).toEqual([{ status: 'pending' }])
  expect((await db.query('SELECT id FROM visit_corrections')).rows).toHaveLength(1)
  expect((await db.query('SELECT reason FROM visit_adjustment_history')).rows).toHaveLength(1)
  expect((await db.query('SELECT details FROM audit_log')).rows).toHaveLength(1)
})

test('audit failure rolls back the status, time, billing, and correction history', async () => {
  failAudit = true
  expect((await correctVisit(completion)).error).toMatch(/No changes were saved/)
  expect((await db.query<{status:string}>('SELECT status FROM scheduled_visits')).rows[0].status).toBe('missed')
  for (const table of ['visit_time_entries', 'visit_financials', 'visit_corrections', 'visit_adjustment_history']) {
    expect((await db.query(`SELECT count(*)::integer AS count FROM ${table}`)).rows).toEqual([{ count: 0 }])
  }
})

test('approved billing must be voided before a completed visit can be corrected to missed', async () => {
  await db.exec(`UPDATE scheduled_visits SET status='completed',caregiver_member_id='${CAREGIVER}';
    INSERT INTO visit_financials(id,agency_id,scheduled_visit_id,status)
      VALUES ('${id(7)}','${AGENCY}','${VISIT}','approved');`)
  const result = await correctVisit({
    scheduledVisitId: VISIT, expectedStatus: 'completed', correctedStatus: 'missed',
    reason: 'Synthetic review found that care did not occur.',
  })
  expect(result.error).toMatch(/Void the approved/i)
  expect((await db.query<{status:string}>('SELECT status FROM scheduled_visits')).rows[0].status).toBe('completed')
})

test('a pending completed visit becomes missed with billing voided and evidence retained', async () => {
  await db.exec(`UPDATE scheduled_visits SET status='completed',caregiver_member_id='${CAREGIVER}';
    INSERT INTO visit_time_entries(id,agency_id,scheduled_visit_id,patient_id,caregiver_member_id,
      clock_in_time,clock_out_time,entry_status)
      VALUES ('${id(8)}','${AGENCY}','${VISIT}','${PATIENT}','${CAREGIVER}',
        '2026-10-19T16:00:00Z','2026-10-19T20:00:00Z','pending_review');
    INSERT INTO visit_financials(id,agency_id,scheduled_visit_id,visit_time_entry_id,status)
      VALUES ('${id(7)}','${AGENCY}','${VISIT}','${id(8)}','pending');`)
  const result = await correctVisit({
    scheduledVisitId: VISIT, expectedStatus: 'completed', correctedStatus: 'missed',
    reason: 'Synthetic review found that care did not occur.',
  })
  expect(result).toEqual({ ok: true })
  expect((await db.query<{status:string}>('SELECT status FROM visit_financials')).rows[0].status).toBe('voided')
  expect((await db.query<{clock_out_time:string}>('SELECT clock_out_time FROM visit_time_entries')).rows[0].clock_out_time).toBeTruthy()
  expect((await db.query('SELECT id FROM visit_corrections')).rows).toHaveLength(1)
})

test('an active coordinator can correct the visit, but another agency cannot', async () => {
  await db.exec("UPDATE user_profiles SET role='care_coordinator'; UPDATE user_agency_roles SET role='care_coordinator'")
  expect(await correctVisit(completion)).toEqual({ ok: true })
  expect((await db.query<{status:string}>('SELECT status FROM scheduled_visits')).rows[0].status).toBe('completed')
  expect((await db.query<{corrected_by_user_id:string}>('SELECT corrected_by_user_id FROM visit_corrections')).rows)
    .toEqual([{ corrected_by_user_id: USER }])
  await db.exec(`UPDATE user_profiles SET role='company_owner',agency_id='${OTHER}';
    UPDATE user_agency_roles SET role='company_owner',agency_id='${OTHER}'`)
  expect((await correctVisit(completion)).error).toMatch(/not found in your agency/i)
})

const approvalInput = {
  scheduledVisitId: VISIT,
  actualHours: 4,
  billableHours: 4,
  note: 'Synthetic approval review.',
  serviceType: 'non_skilled' as const,
  decision: 'approved' as const,
}

test('Time & Billing rejects a missed visit even when called directly', async () => {
  expect((await decideTimeBillingVisit(approvalInput)).error).toMatch(/Complete the visit/i)
  expect((await db.query('SELECT id FROM visit_approvals')).rows).toHaveLength(0)
})

test('Time & Billing requires recorded time and a pending financial record', async () => {
  await db.exec(`UPDATE scheduled_visits SET status='completed',caregiver_member_id='${CAREGIVER}'`)
  expect((await decideTimeBillingVisit(approvalInput)).error).toMatch(/No time entry/i)
  await db.exec(`INSERT INTO visit_time_entries(id,agency_id,scheduled_visit_id,patient_id,
    caregiver_member_id,entry_status) VALUES ('${id(8)}','${AGENCY}','${VISIT}','${PATIENT}',
      '${CAREGIVER}','pending_review')`)
  expect((await decideTimeBillingVisit(approvalInput)).error).toMatch(/No pending financial record/i)
})

test('Time & Billing does not approve a pending record with no caregiver pay rate', async () => {
  await db.exec(`UPDATE scheduled_visits SET status='completed',caregiver_member_id='${CAREGIVER}';
    INSERT INTO visit_time_entries(id,agency_id,scheduled_visit_id,patient_id,caregiver_member_id,
      actual_hours,billable_hours,entry_status)
      VALUES ('${id(8)}','${AGENCY}','${VISIT}','${PATIENT}','${CAREGIVER}',4,4,'pending_review');
    INSERT INTO visit_financials(id,agency_id,scheduled_visit_id,visit_time_entry_id,status,
      pay_rate,pay_unit_type,pay_amount,bill_rate,bill_unit_type,bill_amount)
      VALUES ('${id(7)}','${AGENCY}','${VISIT}','${id(8)}','pending',0,'hour',0,0,'hour',0);`)
  expect((await decideTimeBillingVisit(approvalInput)).error).toMatch(/caregiver pay rate/i)
  expect((await db.query<{status:string}>('SELECT status FROM visit_financials')).rows[0].status).toBe('pending')
})
