/** @jest-environment node */

import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import { withAuthorizedApplication } from '@/lib/repositories/application-access'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))

let mockDb: PGlite
let mockExecutor: Pick<PGlite, 'query'>

jest.mock('@/db', () => {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const fragment = {
      strings,
      values,
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        const params: unknown[] = []
        const query = strings.reduce((text, chunk, index) => {
          if (index === values.length) return text + chunk
          params.push(values[index])
          return text + chunk + '$' + params.length
        }, '')
        return mockExecutor.query(query, params).then(result => result.rows).then(resolve, reject)
      },
    }
    return fragment
  }

  return {
    __esModule: true,
    default: tag,
    withUserContext: async (_id: string, _role: string, _agency: string | null, run: () => Promise<unknown>) =>
      mockDb.transaction(async transaction => {
        mockExecutor = transaction
        try { return await run() } finally { mockExecutor = mockDb }
      }),
  }
})

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const ADMIN = id(1)
const OWNER = id(2)
const COORDINATOR = id(3)
const EXPERT = id(4)
const OTHER_EXPERT = id(5)
const AGENCY_A = id(10)
const AGENCY_B = id(11)
const PLAN_A = id(20)
const PLAN_B = id(21)
const APP_A = id(30)
const APP_B = id(31)
const ITEM_A = id(40)
const DOCUMENT_A = id(41)
const CONVERSATION_A = id(42)

function login(userId: string) {
  jest.mocked(getSession).mockResolvedValue({ user: { id: userId } } as Awaited<ReturnType<typeof getSession>>)
}

beforeAll(async () => {
  mockDb = new PGlite()
  mockExecutor = mockDb
  await mockDb.exec(`
    CREATE TABLE public.user_profiles (
      id uuid PRIMARY KEY,
      role text NOT NULL,
      is_active boolean NOT NULL
    );
    CREATE TABLE public.agencies (id uuid PRIMARY KEY, plan_id uuid);
    CREATE TABLE public.capability_catalog (key text PRIMARY KEY, is_active boolean NOT NULL);
    CREATE TABLE public.plan_capabilities (plan_id uuid NOT NULL, capability_key text NOT NULL);
    CREATE TABLE public.user_agency_roles (
      user_id uuid NOT NULL,
      agency_id uuid NOT NULL,
      role text NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE public.applications (
      id uuid PRIMARY KEY,
      agency_id uuid,
      assigned_expert_id uuid
    );
    CREATE TABLE public.application_playbook_items (id uuid PRIMARY KEY, application_id uuid NOT NULL);
    CREATE TABLE public.application_documents (id uuid PRIMARY KEY, application_id uuid NOT NULL);
    CREATE TABLE public.conversations (id uuid PRIMARY KEY, application_id uuid NOT NULL);
  `)
  await mockDb.query(
    `INSERT INTO public.user_profiles (id, role, is_active) VALUES
      ($1, 'admin', true), ($2, 'company_owner', true),
      ($3, 'care_coordinator', true), ($4, 'expert', true), ($5, 'expert', true)`,
    [ADMIN, OWNER, COORDINATOR, EXPERT, OTHER_EXPERT]
  )
  await mockDb.query('INSERT INTO public.agencies (id, plan_id) VALUES ($1, $2), ($3, $4)', [AGENCY_A, PLAN_A, AGENCY_B, PLAN_B])
  await mockDb.query("INSERT INTO public.capability_catalog (key, is_active) VALUES ('homesights_services', true)")
  await mockDb.query("INSERT INTO public.plan_capabilities (plan_id, capability_key) VALUES ($1, 'homesights_services')", [PLAN_A])
  await mockDb.query(
    `INSERT INTO public.user_agency_roles (user_id, agency_id, role, status) VALUES
      ($1, $2, 'company_owner', 'active'),
      ($3, $2, 'care_coordinator', 'inactive')`,
    [OWNER, AGENCY_A, COORDINATOR]
  )
  await mockDb.query(
    'INSERT INTO public.applications (id, agency_id, assigned_expert_id) VALUES ($1, $2, $3), ($4, $5, $3)',
    [APP_A, AGENCY_A, EXPERT, APP_B, AGENCY_B]
  )
  await mockDb.query('INSERT INTO public.application_playbook_items (id, application_id) VALUES ($1, $2)', [ITEM_A, APP_A])
  await mockDb.query('INSERT INTO public.application_documents (id, application_id) VALUES ($1, $2)', [DOCUMENT_A, APP_A])
  await mockDb.query('INSERT INTO public.conversations (id, application_id) VALUES ($1, $2)', [CONVERSATION_A, APP_A])
})

afterAll(async () => {
  await mockDb.close()
})

test('allows an active agency owner to resolve the agency application and its children', async () => {
  login(OWNER)
  const resources = [
    { applicationId: APP_A },
    { playbookItemId: ITEM_A },
    { documentId: DOCUMENT_A },
    { conversationId: CONVERSATION_A },
  ] as const

  for (const resource of resources) {
    const result = await withAuthorizedApplication(resource, application => Promise.resolve(application))
    expect(result).toMatchObject({ id: APP_A, agencyId: AGENCY_A, actorId: OWNER, actorRole: 'company_owner' })
  }
})

test('denies cross-agency, inactive-membership, and missing-capability access', async () => {
  login(OWNER)
  await expect(withAuthorizedApplication({ applicationId: APP_B }, () => Promise.resolve(true))).rejects.toThrow('Not found or not authorized')

  await mockDb.query('DELETE FROM public.plan_capabilities WHERE plan_id=$1', [PLAN_A])
  await expect(withAuthorizedApplication({ applicationId: APP_A }, () => Promise.resolve(true))).rejects.toThrow('Not found or not authorized')
  await mockDb.query("INSERT INTO public.plan_capabilities (plan_id, capability_key) VALUES ($1, 'homesights_services')", [PLAN_A])

  login(COORDINATOR)
  await expect(withAuthorizedApplication({ applicationId: APP_A }, () => Promise.resolve(true))).rejects.toThrow('Not found or not authorized')

  await mockDb.query("UPDATE public.user_agency_roles SET status='active' WHERE user_id=$1", [COORDINATOR])
  login(COORDINATOR)
  await expect(withAuthorizedApplication({ applicationId: APP_A }, application => Promise.resolve(application.id))).resolves.toBe(APP_A)
  await expect(withAuthorizedApplication({ applicationId: APP_B }, () => Promise.resolve(true))).rejects.toThrow('Not found or not authorized')
})

test('limits experts to assigned applications while platform administrators retain platform access', async () => {
  login(EXPERT)
  await expect(withAuthorizedApplication({ applicationId: APP_A }, application => Promise.resolve(application.id))).resolves.toBe(APP_A)

  login(OTHER_EXPERT)
  await expect(withAuthorizedApplication({ applicationId: APP_A }, () => Promise.resolve(true))).rejects.toThrow('Not found or not authorized')

  login(ADMIN)
  await expect(withAuthorizedApplication({ applicationId: APP_B }, application => Promise.resolve(application.id))).resolves.toBe(APP_B)
})

test('fails closed for missing sessions and invalid identifiers', async () => {
  jest.mocked(getSession).mockResolvedValue(null)
  await expect(withAuthorizedApplication({ applicationId: APP_A }, () => Promise.resolve(true))).rejects.toThrow('Not found or not authorized')

  login(OWNER)
  await expect(withAuthorizedApplication({ applicationId: 'not-a-uuid' }, () => Promise.resolve(true))).rejects.toThrow('Not found or not authorized')
})
