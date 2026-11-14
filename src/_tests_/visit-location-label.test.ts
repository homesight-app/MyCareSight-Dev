import { visitLocationLabel } from '@/lib/visit-location-label'

test('uses the visit-specific saved address instead of a client-profile fallback', () => {
  expect(visitLocationLabel({ patient_address: {
    id: '80000000-0000-4000-8000-000000000010',
    label: 'Home (Primary)',
    street_address: '1 Synthetic Way',
    city: 'Test City',
    state: 'CA',
    zip_code: '92056',
  } })).toBe('Test City, CA')
})

test('clearly identifies a visit that has no assigned location', () => {
  expect(visitLocationLabel({ patient_address: null })).toBe('No visit location')
})
