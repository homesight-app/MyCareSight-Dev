import { calculateLeadFinancialSummary } from '@/lib/lead-financial-summary'

test('adds Neon numeric strings and counts only collected retainers', () => {
  const summary = calculateLeadFinancialSummary([
    {
      stage: 'signed', converted_at: '2026-10-01T12:00:00.000Z',
      price: '10000.00', retainer_amount: '5000.00', retainer_paid_date: '2026-10-01',
    },
    {
      stage: 'signed', converted_at: '2026-10-02T12:00:00.000Z',
      price: '10000.00', retainer_amount: '2500.00', retainer_paid_date: '2026-10-02',
    },
    {
      stage: 'signed', converted_at: '2026-10-03T12:00:00.000Z',
      price: '9000.00', retainer_amount: '2500.00', retainer_paid_date: '2026-10-03',
    },
    {
      stage: 'retainer', converted_at: null,
      price: '4000.00', retainer_amount: '1000.00', retainer_paid_date: null,
    },
  ])

  expect(summary).toEqual({
    totalDeals: 4,
    totalValue: 33000,
    signedValue: 29000,
    retainerCollected: 10000,
  })
})
