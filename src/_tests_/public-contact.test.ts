/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { publicContactSchema } from '@/lib/schemas/public-contact'
import { submitPublicContactLead } from '@/lib/repositories/public-contact'

jest.mock('server-only', () => ({}), { virtual: true })
let db: PGlite
let failAudit = false

jest.mock('postgres', () => {
  type Executor = Pick<PGlite, 'query'>
  const tag = (executor: () => Executor) => (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values,
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      const params: unknown[] = []
      const query = this.strings.reduce((out, chunk, index) => {
        if (index === this.values.length) return out + chunk
        params.push(this.values[index]); return out + chunk + '$' + params.length
      }, '')
      if (failAudit && query.includes('INSERT INTO public.audit_log')) return Promise.reject(new Error('audit outage')).then(resolve, reject)
      return executor().query(query, params).then(result => result.rows).then(resolve, reject)
    } })
  const pool = Object.assign(tag(() => db), { begin: async (fn: (tx: ReturnType<typeof tag>) => Promise<unknown>) =>
    db.transaction(async tx => fn(tag(() => tx))) })
  return { __esModule: true, default: () => pool }
})

const valid = {
  website: '', turnstileToken: 'verified-elsewhere', firstName: 'Ada', lastName: 'Lovelace',
  email: 'ada@example.test', phone: '', company: '', bestTime: '', message: '', serviceType: '',
  smsConsent: 'no' as const, address1: '', address2: '', city: '', state: '', zip: '',
}

beforeAll(async () => { db = new PGlite() }, 60000)
beforeEach(async () => {
  failAudit = false
  await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_type text,contact_first_name text,
      contact_last_name text,contact_email text,contact_phone text,company_name text,service_type text,stage text,
      status text,source text,sms_consent boolean,contact_address1 text,contact_address2 text,contact_city text,
      contact_state text,contact_zip text,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz);
    CREATE TABLE audit_log(agency_id uuid,table_name text,record_id uuid,action text,performed_by_user_id uuid,details jsonb);`)
})
afterAll(async () => { await db?.close() })

test('schema normalizes email and rejects invalid consent', () => {
  expect(publicContactSchema.parse({ ...valid, email: '  ADA@EXAMPLE.TEST ' }).email).toBe('ada@example.test')
  expect(publicContactSchema.safeParse({ ...valid, smsConsent: '' }).success).toBe(false)
})

test('submission inserts one lead and identifier-only audit atomically', async () => {
  expect(await submitPublicContactLead(valid)).toEqual({ accepted: true, rateLimited: false })
  expect((await db.query('SELECT 1 FROM leads')).rows).toHaveLength(1)
  expect((await db.query('SELECT details FROM audit_log')).rows).toHaveLength(1)
})

test('fourth daily email submission is rate limited', async () => {
  await db.query("INSERT INTO leads(lead_type,contact_email,source,created_at) VALUES('agency',$1,'Website',now()),('agency',$1,'Website',now()),('agency',$1,'Website',now())", [valid.email])
  expect(await submitPublicContactLead(valid)).toEqual({ accepted: false, rateLimited: true })
  expect((await db.query('SELECT 1 FROM leads')).rows).toHaveLength(3)
})

test('audit failure rolls back the lead insert', async () => {
  failAudit = true
  await expect(submitPublicContactLead(valid)).rejects.toThrow()
  expect((await db.query('SELECT 1 FROM leads')).rows).toHaveLength(0)
})
