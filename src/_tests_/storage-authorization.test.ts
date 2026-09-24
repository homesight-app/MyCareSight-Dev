/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import {
  auditStoredObjectAccess,
  authorizeStoredObject,
  authorizeStorageUpload,
  STORAGE_BUCKET,
} from '@/lib/storage/authorization'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))

let db: PGlite

jest.mock('@/db', () => {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const fragment = {
      strings,
      values,
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        const params: unknown[] = []
        const compile = (part: { strings: readonly string[]; values: unknown[] }): string =>
          part.strings.reduce((text, chunk, index) => {
            if (index === part.values.length) return text + chunk
            const value = part.values[index]
            if (value && typeof value === 'object' && 'strings' in value && 'values' in value) {
              return text + chunk + compile(value as typeof part)
            }
            params.push(value)
            return text + chunk + '$' + params.length
          }, '')
        return db.query(compile(fragment), params).then(result => result.rows).then(resolve, reject)
      },
    }
    return fragment
  }
  return { __esModule: true, default: tag }
})

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const OWNER = id(1), OTHER = id(2), ADMIN = id(3), STAFF = id(4), AGENCY = id(10), OTHER_AGENCY = id(11)
const APP = id(20), APP_DOC = id(21), PATIENT = id(30), INCIDENT = id(31), TEMPLATE = id(40)
const CAREGIVER = id(50), LICENSE = id(60), REQUIREMENT = id(70), PLAYBOOK = id(71)

function login(userId: string) {
  jest.mocked(getSession).mockResolvedValue({ user: { id: userId } } as Awaited<ReturnType<typeof getSession>>)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE user_profiles(id uuid PRIMARY KEY, role text, is_active boolean);
    CREATE TABLE user_agency_roles(user_id uuid, agency_id uuid, role text, status text);
    CREATE TABLE caregiver_members(id uuid PRIMARY KEY, agency_id uuid, user_id uuid, status text, documents jsonb DEFAULT '[]');
    CREATE TABLE applications(id uuid PRIMARY KEY, agency_id uuid, assigned_expert_id uuid, company_owner_id uuid, caregiver_member_id uuid);
    CREATE TABLE application_documents(id uuid PRIMARY KEY, application_id uuid, document_url text);
    CREATE TABLE licenses(id uuid PRIMARY KEY, agency_id uuid, company_owner_id uuid, caregiver_member_id uuid);
    CREATE TABLE license_documents(id uuid PRIMARY KEY, license_id uuid, document_url text);
    CREATE TABLE caregiver_credentials(id uuid PRIMARY KEY, agency_id uuid, caregiver_member_id uuid, user_id uuid, document_url text);
    CREATE TABLE patients(id uuid PRIMARY KEY, agency_id uuid, documents jsonb);
    CREATE TABLE patient_incidents(id uuid PRIMARY KEY, patient_id uuid, file_path text);
    CREATE TABLE license_requirement_templates(id uuid PRIMARY KEY, file_url text);
    CREATE TABLE playbook_templates(id uuid PRIMARY KEY, file_url text);
    CREATE TABLE license_requirements(id uuid PRIMARY KEY);
    CREATE TABLE playbooks(id uuid PRIMARY KEY);
    CREATE TABLE audit_log(
      id uuid DEFAULT gen_random_uuid(), agency_id uuid, table_name text, record_id uuid,
      action text, performed_by_user_id uuid, details jsonb
    );
  `)
}, 60000)

beforeEach(async () => {
  await db.exec(`
    TRUNCATE audit_log, playbooks, license_requirements, playbook_templates, license_requirement_templates, patient_incidents,
      patients, caregiver_credentials, license_documents, licenses, application_documents,
      applications, caregiver_members, user_agency_roles, user_profiles;
  `)
  await db.query(`INSERT INTO user_profiles VALUES ($1,'company_owner',true),($2,'company_owner',true),($3,'admin',true),($4,'staff_member',true)`, [OWNER, OTHER, ADMIN, STAFF])
  await db.query(`INSERT INTO user_agency_roles VALUES ($1,$3,'company_owner','active'),($2,$4,'company_owner','active')`, [OWNER, OTHER, AGENCY, OTHER_AGENCY])
  await db.query(`INSERT INTO applications VALUES ($1,$2,NULL,$3,NULL)`, [APP, AGENCY, OWNER])
  await db.query(`INSERT INTO application_documents VALUES ($1,$2,'applications/synthetic.pdf')`, [APP_DOC, APP])
  await db.query(`INSERT INTO patients VALUES ($1,$2,$3::jsonb)`, [PATIENT, AGENCY, JSON.stringify([{ path: 'patients/synthetic.pdf' }])])
  await db.query(`INSERT INTO patient_incidents VALUES ($1,$2,NULL)`, [INCIDENT, PATIENT])
  await db.query(`INSERT INTO caregiver_members(id,agency_id,user_id,status) VALUES ($1,$2,$3,'active')`, [CAREGIVER, AGENCY, STAFF])
  await db.query(`INSERT INTO licenses VALUES ($1,$2,$3,$4)`, [LICENSE, AGENCY, OWNER, CAREGIVER])
  await db.query(`INSERT INTO license_requirement_templates VALUES ($1,'templates/synthetic.pdf')`, [TEMPLATE])
  await db.query(`INSERT INTO license_requirements VALUES ($1)`, [REQUIREMENT])
  await db.query(`INSERT INTO playbooks VALUES ($1)`, [PLAYBOOK])
  login(OWNER)
})

afterAll(async () => { await db.close() })

test('authorizes an exact application document for its owner and platform admin', async () => {
  expect(await authorizeStoredObject(STORAGE_BUCKET.APPLICATION, 'applications/synthetic.pdf')).toEqual({
    agencyId: AGENCY,
    recordId: APP,
    tableName: 'application_documents',
  })
  login(ADMIN)
  expect(await authorizeStoredObject(STORAGE_BUCKET.APPLICATION, 'applications/synthetic.pdf')).not.toBeNull()
})

test('denies cross-agency, unregistered, traversal, and inactive-membership paths', async () => {
  login(OTHER)
  expect(await authorizeStoredObject(STORAGE_BUCKET.APPLICATION, 'applications/synthetic.pdf')).toBeNull()
  expect(await authorizeStoredObject(STORAGE_BUCKET.APPLICATION, 'applications/missing.pdf')).toBeNull()
  expect(await authorizeStoredObject(STORAGE_BUCKET.APPLICATION, '../synthetic.pdf')).toBeNull()

  login(OWNER)
  await db.query(`UPDATE user_agency_roles SET status='inactive' WHERE user_id=$1`, [OWNER])
  expect(await authorizeStoredObject(STORAGE_BUCKET.PATIENT, 'patients/synthetic.pdf')).toBeNull()
})

test('authorizes an agency-scoped patient JSON document and an active reference template', async () => {
  expect(await authorizeStoredObject(STORAGE_BUCKET.PATIENT, 'patients/synthetic.pdf')).toEqual({
    agencyId: AGENCY,
    recordId: PATIENT,
    tableName: 'patients',
  })
  login(OTHER)
  expect(await authorizeStoredObject(STORAGE_BUCKET.LICENSE_TEMPLATES, 'templates/synthetic.pdf')).toEqual({
    agencyId: null,
    recordId: TEMPLATE,
    tableName: 'license_requirement_templates',
  })
})

test('writes identifier-only signing evidence without storing the object path', async () => {
  const object = await authorizeStoredObject(STORAGE_BUCKET.APPLICATION, 'applications/synthetic.pdf')
  expect(object).not.toBeNull()
  await auditStoredObjectAccess(OWNER, object!, 'SIGNED_URL')
  const result = await db.query<{ details: unknown }>('SELECT details FROM audit_log')
  expect(result.rows).toHaveLength(1)
  expect(result.rows[0].details).toEqual({ operation: 'SIGNED_URL' })
  expect(JSON.stringify(result.rows[0])).not.toContain('synthetic.pdf')
})

test('generates server-owned upload scopes and denies cross-agency resources', async () => {
  expect(await authorizeStorageUpload('application-document', APP)).toMatchObject({
    bucket: STORAGE_BUCKET.APPLICATION,
    pathPrefix: `${APP}/`,
    recordId: APP,
  })
  expect(await authorizeStorageUpload('patient-incident', INCIDENT)).toMatchObject({
    bucket: STORAGE_BUCKET.PATIENT,
    pathPrefix: `${PATIENT}/incidents/${INCIDENT}_`,
    recordId: INCIDENT,
  })

  login(OTHER)
  expect(await authorizeStorageUpload('application-document', APP)).toBeNull()
  expect(await authorizeStorageUpload('patient-incident', INCIDENT)).toBeNull()
})

test('allows a caregiver to scope only their own certification and license uploads', async () => {
  login(STAFF)
  expect(await authorizeStorageUpload('caregiver-certification', null)).toMatchObject({
    agencyId: AGENCY,
    recordId: CAREGIVER,
    pathPrefix: `certifications/${STAFF}/`,
  })
  expect(await authorizeStorageUpload('license-document', LICENSE)).toMatchObject({
    agencyId: AGENCY,
    recordId: LICENSE,
    pathPrefix: `${LICENSE}/`,
  })

  await db.query(`UPDATE caregiver_members SET status='inactive' WHERE id=$1`, [CAREGIVER])
  expect(await authorizeStorageUpload('caregiver-certification', null)).toBeNull()
  expect(await authorizeStorageUpload('license-document', LICENSE)).toBeNull()
})

test('limits reference-template uploads to platform admins', async () => {
  expect(await authorizeStorageUpload('license-requirement-template', REQUIREMENT)).toBeNull()
  login(ADMIN)
  expect(await authorizeStorageUpload('license-requirement-template', REQUIREMENT)).toMatchObject({
    bucket: STORAGE_BUCKET.LICENSE_TEMPLATES,
    pathPrefix: `${REQUIREMENT}/`,
  })
  expect(await authorizeStorageUpload('playbook-template', PLAYBOOK)).toMatchObject({
    bucket: STORAGE_BUCKET.LICENSE_TEMPLATES,
    pathPrefix: `playbooks/${PLAYBOOK}/`,
  })
})
