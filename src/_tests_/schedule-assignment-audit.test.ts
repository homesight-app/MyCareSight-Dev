/** @jest-environment node */

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { requireAgencyCapability } from '@/lib/feature-access'
import * as q from '@/lib/supabase/query'
import {
  declineScheduleAssignmentRequestAction,
  declineScheduleUnassignmentRequestAction,
  requestScheduleAssignmentAction,
} from '@/app/actions/schedule-assignment-requests'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/feature-access', () => ({ requireAgencyCapability: jest.fn() }))
jest.mock('@/lib/repositories/manager-scheduling', () => ({ managerUpdateSchedule: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({
  declineScheduleAssignmentRequestRpc: jest.fn(),
  declineScheduleUnassignmentRequestRpc: jest.fn(),
  insertAuditLog: jest.fn(),
  submitScheduleAssignmentRequestRpc: jest.fn(),
}))

const ACTOR_ID = '60000000-0000-4000-8000-000000000001'
const AGENCY_ID = '60000000-0000-4000-8000-000000000002'
const SCHEDULE_ID = '60000000-0000-4000-8000-000000000003'
const REQUEST_ID = '60000000-0000-4000-8000-000000000004'

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({
    user: { id: ACTOR_ID },
    profile: { agency_id: AGENCY_ID, role: 'staff_member' },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(requireAgencyCapability).mockResolvedValue({
    userId: ACTOR_ID,
    agencyId: AGENCY_ID,
    role: 'staff_member',
  })
  jest.mocked(q.insertAuditLog).mockResolvedValue({ error: null })
})

test('keeps an assignment request note out of audit details', async () => {
  const note = 'Synthetic request detail that must remain outside the audit log'
  jest.mocked(q.submitScheduleAssignmentRequestRpc).mockResolvedValue({
    data: { ok: true },
    error: null,
  })

  await expect(requestScheduleAssignmentAction(SCHEDULE_ID, `  ${note}  `)).resolves.toEqual({ ok: true })

  expect(q.submitScheduleAssignmentRequestRpc).toHaveBeenCalledWith(SCHEDULE_ID, note)
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    table_name: 'scheduled_visits',
    record_id: SCHEDULE_ID,
    action: 'REQUEST_ASSIGNMENT',
    details: {
      schedule_id: SCHEDULE_ID,
      text_present: true,
      text_length: note.length,
    },
  }))
  expect(JSON.stringify(jest.mocked(q.insertAuditLog).mock.calls[0]?.[0])).not.toContain(note)
  expect(revalidatePath).toHaveBeenCalled()
})

test('keeps assignment decline text out of audit details', async () => {
  const reason = 'Synthetic decline detail that must remain outside the audit log'
  jest.mocked(q.declineScheduleAssignmentRequestRpc).mockResolvedValue({
    data: { ok: true },
    error: null,
  })

  await expect(declineScheduleAssignmentRequestAction(REQUEST_ID, reason)).resolves.toEqual({ ok: true })

  expect(q.declineScheduleAssignmentRequestRpc).toHaveBeenCalledWith(REQUEST_ID, reason)
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    table_name: 'scheduled_visits',
    record_id: REQUEST_ID,
    action: 'DECLINE_ASSIGNMENT',
    details: {
      request_id: REQUEST_ID,
      text_present: true,
      text_length: reason.length,
    },
  }))
  expect(JSON.stringify(jest.mocked(q.insertAuditLog).mock.calls[0]?.[0])).not.toContain(reason)
})

test('keeps unassignment decline text out of audit details', async () => {
  const reason = 'Synthetic unassignment detail that must remain outside the audit log'
  jest.mocked(q.declineScheduleUnassignmentRequestRpc).mockResolvedValue({
    data: { ok: true },
    error: null,
  })

  await expect(declineScheduleUnassignmentRequestAction(REQUEST_ID, reason)).resolves.toEqual({ ok: true })

  expect(q.declineScheduleUnassignmentRequestRpc).toHaveBeenCalledWith(REQUEST_ID, reason)
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    table_name: 'scheduled_visits',
    record_id: REQUEST_ID,
    action: 'DECLINE_UNASSIGNMENT',
    details: {
      request_id: REQUEST_ID,
      text_present: true,
      text_length: reason.length,
    },
  }))
  expect(JSON.stringify(jest.mocked(q.insertAuditLog).mock.calls[0]?.[0])).not.toContain(reason)
})
