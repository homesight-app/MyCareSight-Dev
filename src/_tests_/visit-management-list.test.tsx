import { act, fireEvent, render, screen } from '@testing-library/react'
import VisitManagementContent from '@/components/VisitManagementContent'
import { readManagerVisitEditAction } from '@/app/actions/manager-visit-edit'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'
import { addCalendarDays, todayPacificDate } from '@/lib/pct-week-horizon'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/app/actions/schedule-assignment-requests', () => ({
  approveScheduleAssignmentRequestAction: jest.fn(), approveScheduleUnassignmentRequestAction: jest.fn(),
  assignCaregiverToScheduleAction: jest.fn(), declineScheduleAssignmentRequestAction: jest.fn(),
  declineScheduleUnassignmentRequestAction: jest.fn(), markScheduleMissedAction: jest.fn(),
  markScheduleCancelledAction: jest.fn(), markScheduleOnHoldAction: jest.fn(),
  reinstateScheduleAction: jest.fn(), unassignCaregiverFromScheduleAction: jest.fn(),
}))
jest.mock('@/app/actions/visit-candidates', () => ({
  getCaregiverCandidatesForVisitAction: jest.fn(() => Promise.resolve({ data: [] })),
}))
jest.mock('@/app/actions/visit-corrections', () => ({
  correctVisitAction: jest.fn(), readVisitCorrectionHistoryAction: jest.fn(() => Promise.resolve({ data: [] })),
}))
jest.mock('@/app/actions/manager-visit-edit', () => ({
  readManagerVisitEditAction: jest.fn((scheduledVisitId: string) => Promise.resolve({ data: {
    scheduledVisitId,
    updatedAt: '2099-10-01T12:00:00.000Z',
    visitDate: '2099-10-28',
    scheduledEndDate: '2099-10-28',
    scheduledStartTime: '09:00',
    scheduledEndTime: '10:00',
    caregiverMemberId: null,
    status: 'scheduled',
    visitTimezone: 'America/Los_Angeles',
    actualStartAt: null,
    actualEndAt: null,
    billableHours: 0,
    timeSource: 'none',
    financialStatus: null,
    caregivers: [{ id: 'caregiver-1', name: 'Caregiver Example' }],
  } })),
  updateManagerVisitAction: jest.fn(() => Promise.resolve({ success: true })),
}))
jest.mock('@/components/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, title, onClose, children }: { isOpen: boolean; title: string; onClose: () => void; children: React.ReactNode }) =>
    isOpen ? <div role="dialog" aria-label={title}><button type="button" aria-label="Close modal" onClick={onClose}>Close modal</button>{children}</div> : null,
}))
jest.mock('@/components/InternalNotesPanel', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/CaregiverAssignmentList', () => ({ CaregiverAssignmentList: () => null }))
jest.mock('@/components/VisitShiftOfferModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/VisitCorrectionModal', () => ({ __esModule: true, default: () => null }))

const visit = (status: AllVisitCardDTO['status'], caregiverName: string | null = null): AllVisitCardDTO => ({
  id: '80000000-0000-4000-8000-000000000001',
  date: '2099-10-28', dateLabel: 'Wednesday, October 28, 2099', timeLabel: '09:00 - 10:00',
  visitTitle: 'Morning care', status, statusLabel: status === 'unassigned' ? 'Unassigned' : 'Scheduled',
  correctionCount: 0, typeLabel: 'Routine', clientId: 'patient-1', clientName: 'Synthetic Client',
  locationLabel: 'Test City, CA', caregiverId: caregiverName ? 'caregiver-1' : null, caregiverName,
  adlTasks: ['Meal Preparation'], notes: null, statusReason: null, clientRequiredSkills: [],
  clientPreferredSkills: [], reassignCandidates: [], shiftOffer: null,
})

function renderList(row: AllVisitCardDTO, canCorrectVisits = true) {
  const result = render(<VisitManagementContent
    visits={[]} unassignmentItems={[]} allVisits={[row]}
    allClients={[{ id: row.clientId, name: row.clientName }]} allCaregivers={[]}
    resolved={[]} assignmentApprovedTotal={0} assignmentDeclinedTotal={0}
    unassignmentApprovedTotal={0} unassignmentDeclinedTotal={0} canCorrectVisits={canCorrectVisits}
  />)
  fireEvent.click(screen.getByRole('tab', { name: 'List' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Visit dates' }), { target: { value: 'all' } })
  return result
}

test('patient-first button opens the existing details view', async () => {
  renderList(visit('unassigned'))
  const row = screen.getByRole('button', { name: /View visit details for Synthetic Client/i })
  expect(row).toHaveAttribute('type', 'button')
  expect(row).toHaveTextContent('Synthetic Client')
  expect(row).toHaveTextContent('Meal Preparation')
  expect(row).toHaveTextContent('Scheduled')
  expect(row).toHaveTextContent('Unassigned')
  expect(row).not.toHaveTextContent('Routine')
  await act(async () => { fireEvent.click(row) })
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close visit details' })).toHaveFocus()
  expect(screen.getByRole('tabpanel', { name: 'Overview' })).toHaveTextContent('Meal Preparation')
  expect(screen.getByRole('tab', { name: 'Tasks' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }))
  expect(screen.getByRole('tabpanel', { name: 'Tasks' })).toHaveTextContent('Meal Preparation')
  fireEvent.click(screen.getByRole('tab', { name: 'History' }))
  expect(screen.getByRole('tabpanel', { name: 'History' })).toHaveTextContent('No corrections recorded.')
})

test('manager actions use one edit mode instead of a competing action menu', async () => {
  renderList(visit('unassigned'))
  expect(screen.queryByRole('button', { name: /Actions for Synthetic Client/i })).not.toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Visit actions' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit Visit' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Advertise Shift' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel Visit' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close visit details' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Close$/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Visit' }))
  expect(screen.getByRole('dialog', { name: 'Edit Visit' })).toBeInTheDocument()
  expect(screen.getByLabelText(/Visit location time zone/i)).toHaveValue('America/Los_Angeles')
  expect(screen.getByText(/edits only this visit occurrence/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
})

test('authorized manager retains a retryable Edit action when the initial editor read fails', async () => {
  jest.mocked(readManagerVisitEditAction).mockClear()
  jest.mocked(readManagerVisitEditAction).mockResolvedValueOnce({ data: null, error: 'Editor temporarily unavailable.' })
  renderList(visit('unassigned'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  const editButton = screen.getByRole('button', { name: 'Edit Visit' })
  expect(editButton).toBeEnabled()
  await act(async () => { fireEvent.click(editButton) })
  expect(screen.getByRole('dialog', { name: 'Edit Visit' })).toBeInTheDocument()
  expect(readManagerVisitEditAction).toHaveBeenCalledTimes(2)
})

test('cancellation stays stacked and returns to the same visit details', async () => {
  renderList(visit('unassigned'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Visit' }))
  expect(screen.getByText('Visit Details').closest('[role="dialog"]')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('dialog', { name: 'Cancel Visit' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm Cancellation' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
})

test('completed visits use the same single-visit editor without cancellation', async () => {
  renderList({ ...visit('completed', 'Caregiver Example'), statusLabel: 'Completed' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(screen.getByRole('button', { name: 'Edit Visit' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cancel Visit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Visit actions' })).not.toBeInTheDocument()
})

test('a viewer does not see manager visit actions', async () => {
  renderList(visit('scheduled', 'Caregiver Example'), false)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(screen.queryByRole('button', { name: 'Edit Visit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cancel Visit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument()
})

test('calendar is the default; navigation, filters, and list switching retain state', () => {
  const row = { ...visit('scheduled', 'Caregiver Example'), date: todayPacificDate() }
  render(<VisitManagementContent
    visits={[]} unassignmentItems={[]} allVisits={[row]}
    allClients={[{ id: row.clientId, name: row.clientName }]} allCaregivers={[]}
    resolved={[]} assignmentApprovedTotal={0} assignmentDeclinedTotal={0}
    unassignmentApprovedTotal={0} unassignmentDeclinedTotal={0} canCorrectVisits
  />)
  expect(screen.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('region', { name: 'Client weekly visit calendar' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
  expect(screen.getByText('No visits in this week for the current filters.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  expect(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })).toBeInTheDocument()
  fireEvent.change(screen.getByPlaceholderText(/Search by client/i), { target: { value: 'No match' } })
  expect(screen.getByText('No visits in this week for the current filters.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  fireEvent.click(screen.getByRole('tab', { name: 'List' }))
  expect(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }))
  expect(screen.getByRole('region', { name: 'Client weekly visit calendar' })).toBeInTheDocument()
})

test('calendar visit opens the same details drawer as the list', async () => {
  const row = { ...visit('scheduled', 'Caregiver Example'), date: todayPacificDate() }
  render(<VisitManagementContent
    visits={[]} unassignmentItems={[]} allVisits={[row]}
    allClients={[{ id: row.clientId, name: row.clientName }]} allCaregivers={[]}
    resolved={[]} assignmentApprovedTotal={0} assignmentDeclinedTotal={0}
    unassignmentApprovedTotal={0} unassignmentDeclinedTotal={0} canCorrectVisits
  />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i }))
  })
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
  expect(screen.getByRole('tabpanel', { name: 'Overview' })).toHaveTextContent('Caregiver Example')
})

test('list retains the selected week and can still show all loaded dates', () => {
  const date = todayPacificDate()
  const current = { ...visit('scheduled', 'Caregiver Example'), date }
  const later = { ...current, id: '80000000-0000-4000-8000-000000000002', date: addCalendarDays(date, 8) }
  render(<VisitManagementContent
    visits={[]} unassignmentItems={[]} allVisits={[current, later]}
    allClients={[{ id: current.clientId, name: current.clientName }]} allCaregivers={[]}
    resolved={[]} assignmentApprovedTotal={0} assignmentDeclinedTotal={0}
    unassignmentApprovedTotal={0} unassignmentDeclinedTotal={0} canCorrectVisits
  />)
  fireEvent.click(screen.getByRole('tab', { name: 'List' }))
  expect(screen.getByText('Showing 1 of 2 visits')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Visit dates' }), { target: { value: 'all' } })
  expect(screen.getByText('Showing 2 of 2 visits')).toBeInTheDocument()
})
