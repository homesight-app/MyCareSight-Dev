/** @jest-environment node */

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { encryptSSNWithMetadata } from '@/lib/ssn-crypto'
import { savePersonnelDetails } from '@/lib/repositories/personnel-details'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/ssn-crypto', () => ({
  encryptSSNWithMetadata: jest.fn(),
  ssnToLast4: jest.fn(),
}))
jest.mock('@/db', () => ({
  __esModule: true,
  default: jest.fn(),
  withUserContext: jest.fn(async (
    _userId: string,
    _role: string,
    _agencyId: string | null,
    callback: () => Promise<unknown>,
  ) => callback()),
}))

const ACTOR_ID = '20000000-0000-4000-8000-000000000001'
const TARGET_ID = '20000000-0000-4000-8000-000000000002'
const AGENCY_ID = '20000000-0000-4000-8000-000000000003'

beforeEach(() => {
  jest.clearAllMocks()
})

test('denies an unauthorized actor before invoking SSN encryption', async () => {
  jest.mocked(getSession).mockResolvedValue({
    user: { id: ACTOR_ID },
    profile: { role: 'expert', agency_id: null },
  } as Awaited<ReturnType<typeof getSession>>)
  ;(sql as unknown as jest.Mock).mockResolvedValueOnce([{ user_id: TARGET_ID, agency_id: AGENCY_ID }])

  await expect(savePersonnelDetails(
    { agencyId: AGENCY_ID, userProfileId: TARGET_ID },
    {
      birth_date: '',
      hire_date: '',
      ssn: '123-45-6789',
      ssn_action: 'replace',
      home_address_street: '',
      home_address_city: '',
      home_address_state: '',
      home_address_zip: '',
    },
  )).resolves.toEqual({ success: false, error: 'Forbidden' })

  expect(withUserContext).toHaveBeenCalledTimes(1)
  expect(encryptSSNWithMetadata).not.toHaveBeenCalled()
})

test('prevents a care coordinator from changing DOB or SSN before encryption', async () => {
  jest.mocked(getSession).mockResolvedValue({
    user: { id: ACTOR_ID },
    profile: { role: 'care_coordinator', agency_id: AGENCY_ID },
  } as Awaited<ReturnType<typeof getSession>>)
  ;(sql as unknown as jest.Mock)
    .mockResolvedValueOnce([{ user_id: TARGET_ID, agency_id: AGENCY_ID }])
    .mockResolvedValueOnce([{ ok: true }])
    .mockResolvedValueOnce([{
      id: '20000000-0000-4000-8000-000000000004',
      birth_date: null,
      ssn_encrypted: null,
      ssn_last4: null,
      ssn_key_id: null,
    }])

  const result = await savePersonnelDetails(
    { agencyId: AGENCY_ID, userProfileId: TARGET_ID },
    {
      birth_date: '1980-01-01',
      hire_date: '',
      ssn: '',
      ssn_action: 'keep',
      home_address_street: '',
      home_address_city: '',
      home_address_state: '',
      home_address_zip: '',
    },
  )

  expect(result).toEqual({
    success: false,
    error: 'Only an agency owner or platform administrator can change birth date or SSN.',
  })
  expect(encryptSSNWithMetadata).not.toHaveBeenCalled()
})
