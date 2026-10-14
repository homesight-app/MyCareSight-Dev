import { render, screen } from '@testing-library/react'
import AgencyProgramsContent from '@/components/AgencyProgramsContent'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/app/actions/applications', () => ({ cancelProgramRequest: jest.fn() }))
jest.mock('@/components/ApplyForNewLicenseButton', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))
jest.mock('@/components/ui/SearchInput', () => ({
  __esModule: true,
  default: ({ value, placeholder }: { value: string; placeholder: string }) => (
    <input value={value} placeholder={placeholder} readOnly />
  ),
}))
jest.mock('@/components/ui/RecordActionsMenu', () => ({
  __esModule: true,
  default: () => <button type="button">Actions</button>,
}))

test('uses My Services terminology without changing program routes or records', () => {
  render(
    <AgencyProgramsContent
      programs={[{
        id: 'synthetic-service',
        application_name: 'Synthetic Engagement',
        state: 'CA',
        status: 'in_progress',
        application_playbook_items: [],
      }]}
      totalCount={1}
      page={0}
      pageSize={50}
      pendingRequests={[]}
    />
  )

  expect(screen.getByRole('heading', { name: 'My Services' })).toBeInTheDocument()
  expect(screen.getByText('Track your HomeSights service engagements, requirements, and progress.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Request Service' })).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Search services...')).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Service / Engagement' })).toBeInTheDocument()
})
