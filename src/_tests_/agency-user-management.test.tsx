/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import StaffManagementClient from '@/components/StaffManagementClient'
import { normalizeCaregiverDirectoryStatus } from '@/lib/caregiver-directory-filters'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams('tab=caregivers'),
}))
jest.mock('@/app/actions/agency-users', () => ({ updateCaregiverStatus: jest.fn() }))

jest.mock('@/components/AddStaffMemberModal', () => () => null)
jest.mock('@/components/ViewStaffDetailsModal', () => () => null)
jest.mock('@/components/EditCaregiverSkillsModal', () => () => null)
jest.mock('@/components/EditCaregiverHomeAddressModal', () => () => null)
jest.mock('@/components/EditStaffModal', () => () => null)
jest.mock('@/components/ManageLicensesModal', () => () => null)
jest.mock('@/components/ManageCaregiverDocumentsModal', () => () => null)

const AGENCY_ID = '30000000-0000-4000-8000-000000000001'
const activeCaregiver = {
  id: '30000000-0000-4000-8000-000000000002',
  first_name: 'Synthetic',
  last_name: 'Caregiver',
  email: 'synthetic@example.invalid',
  role: 'Caregiver',
  status: 'active',
}

beforeEach(() => jest.clearAllMocks())

test('defaults a missing or invalid caregiver status filter to active', () => {
  expect(normalizeCaregiverDirectoryStatus(undefined)).toBe('active')
  expect(normalizeCaregiverDirectoryStatus('all')).toBe('active')
  expect(normalizeCaregiverDirectoryStatus('inactive')).toBe('inactive')
})

test('preserves the Caregivers parent tab when selecting the inactive filter', () => {
  render(
    <StaffManagementClient
      staffMembers={[activeCaregiver]}
      licensesByStaff={{}}
      totalStaff={1}
      activeStaff={1}
      expiringLicenses={0}
      staffWithExpiringLicenses={[activeCaregiver]}
      staffRoleNames={[]}
      agencyId={AGENCY_ID}
      totalCount={1}
      page={0}
      pageSize={50}
      initialStatus="active"
    />
  )

  fireEvent.click(screen.getByRole('button', { name: /^Inactive/ }))

  expect(push).toHaveBeenCalledWith('?tab=caregivers&status=inactive', { scroll: false })
})
