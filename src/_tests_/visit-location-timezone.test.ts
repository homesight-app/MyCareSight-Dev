import { resolveVisitTimezoneFromZip } from '@/lib/visit-location-timezone'

test('resolves synthetic US visit ZIPs to supported IANA time zones', () => {
  expect(resolveVisitTimezoneFromZip('92056')).toBe('America/Los_Angeles')
  expect(resolveVisitTimezoneFromZip('10001')).toBe('America/New_York')
  expect(resolveVisitTimezoneFromZip('60601-1234')).toBe('America/Chicago')
})

test('fails closed when a visit ZIP cannot be resolved', () => {
  expect(resolveVisitTimezoneFromZip('')).toBeNull()
  expect(resolveVisitTimezoneFromZip('00000')).toBeNull()
})
