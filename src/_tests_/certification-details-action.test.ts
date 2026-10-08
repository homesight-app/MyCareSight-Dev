/** @jest-environment node */

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { requirePlatformStaffOrAgencyRole } from '@/lib/permissions'
import { createLicenseForAgency, updateCertificationDetails } from '@/app/actions/licenses'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({}))
jest.mock('@/lib/storage/client', () => ({ removeFiles: jest.fn() }))
jest.mock('@/lib/permissions', () => ({ requirePlatformStaffOrAgencyRole: jest.fn() }))
jest.mock('@/db', () => ({
  __esModule: true,
  default: jest.fn(),
  withUserContext: jest.fn(async (_userId: string, _role: string, _agencyId: string, callback: () => Promise<unknown>) => callback()),
}))

const USER_ID = '20000000-0000-4000-8000-000000000001'
const AGENCY_ID = '20000000-0000-4000-8000-000000000002'
const LICENSE_ID = '20000000-0000-4000-8000-000000000003'
const CATEGORY_ID = '20000000-0000-4000-8000-000000000004'

const input = {
  license_name: 'Synthetic Certification',
  license_number: 'SYN-200',
  state: 'California',
  status: 'active' as const,
  category_id: CATEGORY_ID,
  issuing_body: 'Synthetic Authority',
  activated_date: '2025-08-04',
  expiry_date: '2026-08-11',
  renewal_due_date: '2026-08-18',
}

const mockSql = sql as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({
    user: { id: USER_ID },
    profile: { role: 'admin' },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(requirePlatformStaffOrAgencyRole).mockResolvedValue({
    error: null,
    session: {
      user: { id: USER_ID },
      profile: { role: 'company_owner' },
      agencyRoles: [{ agency_id: AGENCY_ID, role: 'company_owner', status: 'active' }],
    },
  } as Awaited<ReturnType<typeof requirePlatformStaffOrAgencyRole>>)
})

test('rejects an inactive or foreign category before creating a certification', async () => {
  mockSql.mockResolvedValueOnce([])

  await expect(createLicenseForAgency({
    agencyId: AGENCY_ID,
    license_name: input.license_name,
    license_number: input.license_number,
    state: input.state,
    activated_date: input.activated_date,
    expiry_date: input.expiry_date,
    renewal_due_date: input.renewal_due_date,
    category_id: CATEGORY_ID,
    issuing_body: input.issuing_body,
  })).resolves.toEqual({
    error: 'Select a valid category.',
    fieldErrors: { category_id: ['Select a valid category'] },
    data: null,
  })
  expect(mockSql).toHaveBeenCalledTimes(1)
})

test('updates only the agency-scoped license category_id and writes an audit event', async () => {
  mockSql
    .mockResolvedValueOnce([{ id: CATEGORY_ID }])
    .mockResolvedValueOnce([{ id: LICENSE_ID }])
    .mockResolvedValueOnce([])

  await expect(updateCertificationDetails(LICENSE_ID, AGENCY_ID, input)).resolves.toEqual({ success: true })

  expect(withUserContext).toHaveBeenCalledWith(USER_ID, 'company_owner', AGENCY_ID, expect.any(Function))
  expect(mockSql).toHaveBeenCalledTimes(3)

  const updateCall = mockSql.mock.calls[1]
  const updateText = (updateCall[0] as TemplateStringsArray).join(' ')
  expect(updateText).toContain('category_id =')
  expect(updateText).toContain('AND agency_id =')
  expect(updateText).not.toContain('certification_category')
  expect(updateCall).toContain(LICENSE_ID)
  expect(updateCall).toContain(AGENCY_ID)

  const auditText = (mockSql.mock.calls[2][0] as TemplateStringsArray).join(' ')
  expect(auditText).toContain('INSERT INTO public.audit_log')
})

test('rejects a category outside the active top-level configuration list', async () => {
  mockSql.mockResolvedValueOnce([])

  await expect(updateCertificationDetails(LICENSE_ID, AGENCY_ID, input)).resolves.toEqual({
    success: false,
    error: 'Check the highlighted fields.',
    fieldErrors: { category_id: ['Select a valid category'] },
  })
  expect(mockSql).toHaveBeenCalledTimes(1)
})

test('fails closed before database access when the actor lacks agency access', async () => {
  jest.mocked(requirePlatformStaffOrAgencyRole).mockResolvedValueOnce({ error: 'Forbidden', session: null })

  await expect(updateCertificationDetails(LICENSE_ID, AGENCY_ID, input)).resolves.toEqual({
    success: false,
    error: 'Forbidden',
  })
  expect(mockSql).not.toHaveBeenCalled()
})
