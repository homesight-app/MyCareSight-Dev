import { render, screen } from '@testing-library/react'
import StateSelect from '@/components/ui/StateSelect'
import { normalizeUSState, US_STATES, US_STATE_NAMES_BY_CODE } from '@/lib/constants'
import { usStateField } from '@/lib/schemas/us-state'
import { companyDetailsSchema } from '@/lib/schemas/profile'

test('the shared state names retain alphabetical order and every abbreviation resolves to one state', () => {
  expect(US_STATES).toHaveLength(50)
  expect(new Set(US_STATES).size).toBe(50)
  expect(US_STATES).toEqual([...US_STATES].sort())
  for (const [code, name] of Object.entries(US_STATE_NAMES_BY_CODE)) {
    expect(normalizeUSState(code.toLowerCase())).toBe(name)
    expect(normalizeUSState(name)).toBe(name)
  }
})

test('state validation accepts names, legacy abbreviations and optional blank; rejects arbitrary text', () => {
  expect(usStateField.parse(' ca ')).toBe('California')
  expect(usStateField.parse('new york')).toBe('New York')
  expect(usStateField.parse('')).toBe('')
  expect(usStateField.safeParse('Synthetic invalid state').success).toBe(false)
  expect(usStateField.safeParse('constructor').success).toBe(false)
})

test('the reusable dropdown exposes the shared list and retains an unknown legacy value for correction', () => {
  render(<StateSelect aria-label="State" currentValue="Legacy value" defaultValue="Legacy value" />)
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveValue('Legacy value')
  expect(screen.getAllByRole('option')).toHaveLength(52)
  expect(screen.getByRole('option', { name: 'California' })).toHaveValue('California')
  expect(screen.getByRole('option', { name: 'Legacy value (choose a state)' })).toBeInTheDocument()
})

test('agency addresses require a valid physical state and validate mailing state only when separate', () => {
  const input = { companyName: 'Synthetic Agency', businessType: 'Synthetic Type', taxId: 'SYNTHETIC',
    primaryLicenseNumber: 'SYNTHETIC', physicalStreetAddress: 'Synthetic Street', physicalCity: 'Synthetic City',
    physicalState: 'CA', physicalZipCode: '00000', sameAsPhysical: true, mailingState: 'Unused legacy value' }
  expect(companyDetailsSchema.parse(input).physicalState).toBe('California')
  expect(companyDetailsSchema.safeParse({ ...input, physicalState: '' }).success).toBe(false)
  expect(companyDetailsSchema.safeParse({ ...input, physicalState: 'INVALID' }).success).toBe(false)
  const separate = { ...input, sameAsPhysical: false, mailingStreetAddress: 'Synthetic Mail', mailingCity: 'Synthetic City', mailingZipCode: '00000' }
  const invalid = companyDetailsSchema.safeParse(separate)
  expect(invalid.success).toBe(false)
  if (!invalid.success) expect(invalid.error.issues.some(issue => issue.path[0] === 'mailingState')).toBe(true)
  expect(companyDetailsSchema.parse({ ...separate, mailingState: 'ny' }).mailingState).toBe('New York')
})
