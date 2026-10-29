/** @jest-environment node */

import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { createAgency, updateAgency } from '@/app/actions/agencies'
import type { AgencyFormData } from '@/lib/schemas/agency'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({
  insertAgency: jest.fn(),
  getAgenciesExceptId: jest.fn(),
  updateAgencyById: jest.fn(),
  updateClientCompanyAndAgencyForIds: jest.fn(),
  updateClientClearAgencyForIds: jest.fn(),
  updateAgencyAdminIds: jest.fn(),
}))
jest.mock('@/lib/storage/client', () => ({ uploadFile: jest.fn(), removeFiles: jest.fn() }))
jest.mock('@/db', () => ({ __esModule: true, default: jest.fn() }))

const USER_ID = '10000000-0000-4000-8000-000000000001'

const validInput: AgencyFormData = {
  companyName: 'Synthetic Staging Agency',
  agencyAdminIds: [],
  businessType: 'Home Health',
  taxId: '',
  primaryLicenseNumber: '',
  physicalStreetAddress: '',
  physicalCity: '',
  physicalState: '',
  physicalZipCode: '',
  sameAsPhysical: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({
    user: { id: USER_ID },
    profile: { role: 'admin' },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(q.insertAgency).mockResolvedValue({
    data: { id: '20000000-0000-4000-8000-000000000001' },
    error: null,
  })
  jest.mocked(q.getAgenciesExceptId).mockResolvedValue({ data: [], error: null })
  jest.mocked(q.updateAgencyById).mockResolvedValue({ data: null, error: null })
})

test('rejects agency creation without an authenticated session', async () => {
  jest.mocked(getSession).mockResolvedValueOnce(null)

  await expect(createAgency(validInput)).resolves.toEqual({
    success: false,
    error: 'Not authenticated',
    data: null,
  })
  expect(q.insertAgency).not.toHaveBeenCalled()
})

test('rejects agency creation for a non-platform role', async () => {
  jest.mocked(getSession).mockResolvedValueOnce({
    user: { id: USER_ID },
    profile: { role: 'company_owner' },
  } as Awaited<ReturnType<typeof getSession>>)

  await expect(createAgency(validInput)).resolves.toEqual({
    success: false,
    error: 'Forbidden',
    data: null,
  })
  expect(q.insertAgency).not.toHaveBeenCalled()
})

test('omits absent state-specific data from the agency insert', async () => {
  await expect(createAgency(validInput)).resolves.toMatchObject({ success: true, error: null })

  const payload = jest.mocked(q.insertAgency).mock.calls[0][0]
  expect(payload).not.toHaveProperty('state_specific_data')
  expect(payload).toMatchObject({
    name: 'Synthetic Staging Agency',
    agency_admin_ids: [],
  })
})

test('includes state-specific data when it is supplied', async () => {
  const stateSpecificData = { synthetic_requirement: true }

  await createAgency({ ...validInput, stateSpecificData })

  expect(jest.mocked(q.insertAgency).mock.calls[0][0]).toHaveProperty(
    'state_specific_data',
    stateSpecificData,
  )
})

test('omits absent state-specific data from a basic agency edit', async () => {
  await expect(
    updateAgency('20000000-0000-4000-8000-000000000001', validInput, []),
  ).resolves.toMatchObject({ success: true, error: null })

  const payload = jest.mocked(q.updateAgencyById).mock.calls[0][1]
  expect(payload).not.toHaveProperty('state_specific_data')
})

test('does not expose database-driver errors to the user', async () => {
  jest.mocked(q.insertAgency).mockResolvedValueOnce({
    data: null,
    error: {
      message: 'UNDEFINED_VALUE: Undefined values are not allowed',
      code: '',
      details: '',
      hint: '',
      name: 'Error',
    },
  })

  await expect(createAgency(validInput)).resolves.toEqual({
    success: false,
    error: 'Failed to create agency. Please try again.',
    data: null,
  })
})
