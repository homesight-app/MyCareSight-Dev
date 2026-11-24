/** @jest-environment node */
import { revalidateTag } from 'next/cache'
import * as repository from '@/lib/repositories/agency-branches'
import { assignRecordBranchesAction, requestProgramBranchesAction, saveBranchAction } from '@/app/actions/agency-branches'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }))
jest.mock('@/lib/repositories/agency-branches', () => ({
  BranchError: class BranchError extends Error {}, saveBranch: jest.fn(), assignRecordBranches: jest.fn(), requestProgramWithBranches: jest.fn(),
}))

const id = '30000000-0000-4000-8000-000000000001'
const branch = { code: 'west', name: 'Synthetic West', timezone: 'America/Los_Angeles', street_address: '', city: '', state: '', zip_code: '', phone: '', email: '' }

beforeEach(() => jest.resetAllMocks())

test('invalid form data and oversized/multiple client branch assignments never reach a write', async () => {
  expect(await saveBranchAction({ ...branch, code: 'INVALID CODE', timezone: 'invalid' })).toMatchObject({ success: false, fieldErrors: expect.any(Object) })
  expect(await assignRecordBranchesAction({ kind: 'client', recordId: id, branchIds: [id, id] })).toMatchObject({ success: false })
  expect(repository.saveBranch).not.toHaveBeenCalled()
  expect(repository.assignRecordBranches).not.toHaveBeenCalled()
})

test('private raw failures are replaced with fixed non-content messages', async () => {
  jest.mocked(repository.saveBranch).mockRejectedValue(new Error('synthetic-private-value'))
  const response = await saveBranchAction(branch)
  expect(response.success).toBe(false)
  expect(JSON.stringify(response)).not.toContain('synthetic-private-value')
})

test('a cache error after commit does not invite a repeated branch creation', async () => {
  jest.mocked(repository.saveBranch).mockResolvedValue(id)
  jest.mocked(revalidateTag).mockImplementation(() => { throw new Error('synthetic cache failure') })
  expect(await saveBranchAction(branch)).toEqual({ success: true, id })
  expect(repository.saveBranch).toHaveBeenCalledTimes(1)
})

test('the request boundary discards submitted tenant/role fields and requires a shared validated branch selection', async () => {
  const request = { requestId: id, playbook_id: id, state: 'CA', branchIds: [id] }
  jest.mocked(repository.requestProgramWithBranches).mockResolvedValue(id)
  expect(await requestProgramBranchesAction({ ...request, agencyId: 'forged', role: 'admin' })).toEqual({ success: true, id })
  expect(repository.requestProgramWithBranches).toHaveBeenCalledWith(request)
  expect(await requestProgramBranchesAction({ ...request, branchIds: [] })).toMatchObject({ success: false })
  expect(repository.requestProgramWithBranches).toHaveBeenCalledTimes(1)
})
