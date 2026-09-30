/** @jest-environment node */
import sql from '@/db'
import { getLeadTasks } from '@/lib/supabase/query/leads'

jest.mock('@/db', () => ({ __esModule: true, default: jest.fn() }))

const mockSql = sql as unknown as jest.Mock

describe('lead task date boundary', () => {
  afterEach(() => jest.clearAllMocks())

  it('returns date-only due dates and ISO timestamps when PostgreSQL returns Date objects', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-task', lead_id: 'synthetic-lead', created_by: 'synthetic-user',
      assigned_to: null, title: 'Synthetic follow-up',
      due_date: new Date('2026-10-01T00:00:00.000Z'),
      completed_at: new Date('2026-10-01T12:30:00.000Z'),
      created_at: new Date('2026-09-29T22:00:00.000Z'),
      updated_at: new Date('2026-10-01T12:30:00.000Z'),
    }])

    const result = await getLeadTasks('synthetic-lead')
    expect(result.error).toBeNull()
    expect(result.data?.[0]).toMatchObject({
      due_date: '2026-10-01', completed_at: '2026-10-01T12:30:00.000Z',
      created_at: '2026-09-29T22:00:00.000Z', updated_at: '2026-10-01T12:30:00.000Z',
    })
    // The Tasks tab uses this string operation before rendering due-date labels.
    expect(result.data?.[0].due_date?.includes('T')).toBe(false)
  })

  it('preserves nullable dates and already serialized strings', async () => {
    mockSql.mockResolvedValueOnce([{
      id: 'synthetic-task', lead_id: 'synthetic-lead', created_by: 'synthetic-user',
      assigned_to: null, title: 'Synthetic follow-up', due_date: null,
      completed_at: null, created_at: '2026-09-29T22:00:00.000Z',
      updated_at: '2026-09-29T22:00:00.000Z',
    }])
    const result = await getLeadTasks('synthetic-lead')
    expect(result.error).toBeNull()
    expect(result.data?.[0]).toMatchObject({
      due_date: null, completed_at: null, created_at: '2026-09-29T22:00:00.000Z',
    })
  })
})
