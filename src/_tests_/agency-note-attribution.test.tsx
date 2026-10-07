/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react'
import sql from '@/db'
import { getAgencyNotes } from '@/lib/supabase/query/agencies'
import AgencyNotesTab from '@/components/AgencyNotesTab'
import * as queryBridge from '@/app/actions/query-bridge'

jest.mock('@/db', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@/app/actions/query-bridge', () => ({
  getAgencyNotes: jest.fn(),
  getLeadNotesByLeadIds: jest.fn(),
}))
jest.mock('@/app/actions/agencies', () => ({
  addAgencyNote: jest.fn(),
  deleteAgencyNote: jest.fn(),
}))
jest.mock('@/app/actions/leads', () => ({ deleteLeadNote: jest.fn() }))

const mockSql = sql as unknown as jest.Mock

afterEach(() => jest.clearAllMocks())

test('joins an agency note author from the shared user profile', async () => {
  mockSql.mockResolvedValueOnce([{
    id: 'synthetic-note',
    agency_id: 'synthetic-agency',
    author_id: 'synthetic-user',
    content: 'Synthetic agency note',
    note_type: 'general',
    created_at: '2026-10-07T12:00:00.000Z',
    author_full_name: 'Synthetic Author',
  }])

  const result = await getAgencyNotes('synthetic-agency')

  expect(result.error).toBeNull()
  expect(result.data?.[0]).toMatchObject({
    author_id: 'synthetic-user',
    author: { full_name: 'Synthetic Author' },
  })
})

test('renders the agency-note author returned by the repository', async () => {
  jest.mocked(queryBridge.getAgencyNotes).mockResolvedValue({
    data: [{
      id: 'synthetic-note',
      agency_id: 'synthetic-agency',
      author_id: 'synthetic-user',
      content: 'Synthetic agency note',
      note_type: 'general',
      created_at: '2026-10-07T12:00:00.000Z',
      author_full_name: 'Synthetic Author',
      author: { full_name: 'Synthetic Author' },
    }],
    error: null,
  } as Awaited<ReturnType<typeof queryBridge.getAgencyNotes>>)
  jest.mocked(queryBridge.getLeadNotesByLeadIds).mockResolvedValue({ data: [], error: null })

  render(<AgencyNotesTab agencyId="synthetic-agency" leadIds={[]} leadNameMap={{}} />)

  expect(await screen.findByText('Synthetic Author')).toBeInTheDocument()
  expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
})
