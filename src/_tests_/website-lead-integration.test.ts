/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { websiteLeadSchema } from '@/lib/schemas/lead-integration'
import {
  createLeadIntegrationCredential,
  ingestWebsiteLead,
  listLeadIntegrationCredentials,
  revokeLeadIntegrationCredential,
} from '@/lib/repositories/lead-integrations'

jest.mock('server-only', () => ({}), { virtual: true })

let db: PGlite

jest.mock('postgres', () => {
  type Executor = Pick<PGlite, 'query'>
  const makeTag = (executor: () => Executor) => {
    const tag = (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        const params: unknown[] = []
        const query = this.strings.reduce((out, chunk, index) => {
          if (index === this.values.length) return out + chunk
          params.push(this.values[index])
          return out + chunk + '$' + params.length
        }, '')
        return executor().query(query, params).then(result => result.rows).then(resolve, reject)
      },
    })
    tag.json = (value: unknown) => JSON.stringify(value)
    return tag
  }
  const pool = Object.assign(makeTag(() => db), {
    begin: async (fn: (tx: ReturnType<typeof makeTag>) => Promise<unknown>) =>
      db.transaction(async tx => fn(makeTag(() => tx))),
  })
  return { __esModule: true, default: () => pool }
})

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/017-website-lead-integration.sql'),
  'utf8'
)

const ADMIN_ID = '10000000-0000-4000-8000-000000000001'
const AGENCY_ID = '20000000-0000-4000-8000-000000000001'

const validLead = {
  firstName: 'Synthetic',
  lastName: 'Prospect',
  email: 'prospect@example.test',
  phone: '(555) 555-0100',
  companyName: '',
  serviceType: 'companion' as const,
  message: 'Synthetic UAT inquiry',
  smsConsent: false,
  address1: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
}

beforeAll(async () => {
  process.env.AUTH_SECRET = 'synthetic-test-auth-secret'
  db = new PGlite()
  await db.exec(`
    CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE agencies (
      id uuid PRIMARY KEY,
      status text NOT NULL
    );
    CREATE TABLE user_profiles (
      id uuid PRIMARY KEY,
      role text NOT NULL,
      is_active boolean NOT NULL
    );
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_type text NOT NULL,
      agency_id uuid,
      contact_first_name text,
      contact_last_name text,
      contact_email text,
      contact_phone text,
      company_name text,
      service_type text,
      stage text NOT NULL,
      status text NOT NULL,
      source text,
      sms_consent boolean,
      contact_address1 text,
      contact_address2 text,
      contact_city text,
      contact_state text,
      contact_zip text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE agency_lead_stages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id uuid NOT NULL,
      key text NOT NULL,
      sort_order integer NOT NULL,
      is_entry boolean NOT NULL
    );
    CREATE TABLE audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id uuid,
      table_name text NOT NULL,
      record_id uuid,
      action text NOT NULL,
      performed_by_user_id uuid,
      details jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO agencies VALUES ('${AGENCY_ID}', 'active');
    INSERT INTO user_profiles VALUES ('${ADMIN_ID}', 'admin', true);
    INSERT INTO agency_lead_stages (agency_id, key, sort_order, is_entry)
    VALUES ('${AGENCY_ID}', 'new', 0, true);
  `)
  await db.exec(migration)
}, 60_000)

afterAll(async () => {
  delete process.env.AUTH_SECRET
  await db.close()
})

test('website lead schema rejects unknown fields and invalid phone numbers', () => {
  expect(websiteLeadSchema.safeParse({ ...validLead, agencyId: AGENCY_ID }).success).toBe(false)
  expect(websiteLeadSchema.safeParse({ ...validLead, phone: '123' }).success).toBe(false)
  expect(websiteLeadSchema.parse({ ...validLead, email: ' PROSPECT@EXAMPLE.TEST ' }).email)
    .toBe('prospect@example.test')
})

test('credential creation stores only a hash and returns the secret once', async () => {
  const created = await createLeadIntegrationCredential({
    agencyId: AGENCY_ID,
    name: 'Client website',
    createdBy: ADMIN_ID,
  })
  expect(created.apiKey).toMatch(/^mcs_web_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/)

  const stored = await db.query<{ key_hash: string; key_prefix: string }>(
    'SELECT key_hash, key_prefix FROM lead_integration_credentials WHERE id = $1',
    [created.credential.id]
  )
  expect(stored.rows[0]?.key_hash).toBe(createHash('sha256').update(created.apiKey).digest('hex'))
  expect(JSON.stringify(stored.rows[0])).not.toContain(created.apiKey)

  const listed = await listLeadIntegrationCredentials(AGENCY_ID)
  expect(listed[0]).toMatchObject({ name: 'Client website', status: 'active' })
  expect(listed[0]).not.toHaveProperty('keyHash')
})

test('authenticated delivery creates the existing agency patient lead shape', async () => {
  const created = await createLeadIntegrationCredential({
    agencyId: AGENCY_ID,
    name: 'Ingestion test',
    createdBy: ADMIN_ID,
  })
  const result = await ingestWebsiteLead({
    apiKey: created.apiKey,
    idempotencyKey: 'submission-0001',
    ipAddress: '192.0.2.10',
    lead: validLead,
  })
  expect(result.kind).toBe('created')

  const leads = await db.query<{
    lead_type: string
    agency_id: string
    stage: string
    source: string
    contact_email: string
  }>('SELECT lead_type, agency_id, stage, source, contact_email FROM leads')
  expect(leads.rows).toHaveLength(1)
  expect(leads.rows[0]).toEqual({
    lead_type: 'patient',
    agency_id: AGENCY_ID,
    stage: 'new',
    source: 'Website',
    contact_email: validLead.email,
  })

  const audit = await db.query<{ details: Record<string, unknown> }>(
    "SELECT details FROM audit_log WHERE table_name='leads'"
  )
  expect(JSON.stringify(audit.rows[0]?.details)).not.toContain(validLead.email)
  expect(JSON.stringify(audit.rows[0]?.details)).not.toContain(validLead.message)
})

test('same idempotency key returns the original lead and rejects changed content', async () => {
  const created = await createLeadIntegrationCredential({
    agencyId: AGENCY_ID,
    name: 'Idempotency test',
    createdBy: ADMIN_ID,
  })
  const first = await ingestWebsiteLead({
    apiKey: created.apiKey,
    idempotencyKey: 'submission-0002',
    ipAddress: '192.0.2.11',
    lead: validLead,
  })
  const duplicate = await ingestWebsiteLead({
    apiKey: created.apiKey,
    idempotencyKey: 'submission-0002',
    ipAddress: '192.0.2.11',
    lead: validLead,
  })
  const conflict = await ingestWebsiteLead({
    apiKey: created.apiKey,
    idempotencyKey: 'submission-0002',
    ipAddress: '192.0.2.11',
    lead: { ...validLead, firstName: 'Changed' },
  })

  expect(first).toMatchObject({ kind: 'created' })
  expect(duplicate).toEqual({ kind: 'duplicate', leadId: (first as { leadId: string }).leadId })
  expect(conflict).toEqual({ kind: 'idempotency_conflict' })
})

test('revoked and unknown credentials cannot submit leads', async () => {
  const created = await createLeadIntegrationCredential({
    agencyId: AGENCY_ID,
    name: 'Revocation test',
    createdBy: ADMIN_ID,
  })
  expect(await revokeLeadIntegrationCredential({
    agencyId: AGENCY_ID,
    credentialId: created.credential.id,
    revokedBy: ADMIN_ID,
  })).toBe(true)

  await expect(ingestWebsiteLead({
    apiKey: created.apiKey,
    idempotencyKey: 'submission-0003',
    ipAddress: '192.0.2.12',
    lead: validLead,
  })).resolves.toEqual({ kind: 'unauthorized' })
  await expect(ingestWebsiteLead({
    apiKey: 'mcs_web_000000000000_invalid',
    idempotencyKey: 'submission-0004',
    ipAddress: '192.0.2.13',
    lead: validLead,
  })).resolves.toEqual({ kind: 'unauthorized' })
})

test('credential rate limiting is durable across requests', async () => {
  const created = await createLeadIntegrationCredential({
    agencyId: AGENCY_ID,
    name: 'Rate limit test',
    createdBy: ADMIN_ID,
  })
  const stored = await db.query<{ key_hash: string }>(
    'SELECT key_hash FROM lead_integration_credentials WHERE id = $1',
    [created.credential.id]
  )
  await db.query(`
    INSERT INTO lead_integration_rate_limit_events (scope, subject_hash)
    SELECT 'credential', $1 FROM generate_series(1, 60)
  `, [stored.rows[0]?.key_hash])

  await expect(ingestWebsiteLead({
    apiKey: created.apiKey,
    idempotencyKey: 'submission-0005',
    ipAddress: '192.0.2.14',
    lead: validLead,
  })).resolves.toEqual({ kind: 'rate_limited' })
})

test('migration denies public reads while granting only required runtime access', async () => {
  const result = await db.query<{
    public_read: boolean
    app_read: boolean
    app_delete_credentials: boolean
  }>(`
    SELECT
      has_table_privilege('public', 'lead_integration_credentials', 'SELECT') AS public_read,
      has_table_privilege('mycaresight_app', 'lead_integration_credentials', 'SELECT') AS app_read,
      has_table_privilege('mycaresight_app', 'lead_integration_credentials', 'DELETE') AS app_delete_credentials
  `)
  expect(result.rows[0]).toEqual({
    public_read: false,
    app_read: true,
    app_delete_credentials: false,
  })
})
