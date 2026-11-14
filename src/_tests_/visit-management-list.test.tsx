import { act, fireEvent, render, screen } from '@testing-library/react'
import VisitManagementContent from '@/components/VisitManagementContent'
import { readManagerVisitEditAction } from '@/app/actions/manager-visit-edit'
import { getCaregiverCandidatesForVisitAction } from '@/app/actions/visit-candidates'
import { readVisitCorrectionHistoryAction } from '@/app/actions/visit-corrections'
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
    patientAddressId: '80000000-0000-4000-8000-000000000010',
    visitLocations: [{ id: '80000000-0000-4000-8000-000000000010', label: 'Home (Primary)', displayAddress: '1 Synthetic Way, Test City, CA 92056' }],
    visitDate: '2099-10-28',
    scheduledEndDate: '2099-10-28',
    scheduledStartTime: '09:00',
    scheduledEndTime: '10:00',
    caregiverMemberId: null,
    caregiverName: null,
    status: 'scheduled',
    visitTimezone: 'America/Los_Angeles',
    actualStartAt: null,
    actualEndAt: null,
    actualHours: null,
    timeSource: 'none',
    financialStatus: null,
  } })),
  updateManagerVisitAction: jest.fn(() => Promise.resolve({ success: true })),
}))
jest.mock('@/components/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, title, onClose, children }: { isOpen: boolean; title: string; onClose: () => void; children: React.ReactNode }) =>
    isOpen ? <div role="dialog" aria-label={title}><button type="button" aria-label="Close modal" onClick={onClose}>Close modal</button>{children}</div> : null,
}))
jest.mock('@/components/InternalNotesPanel', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/CaregiverAssignmentList', () => ({
  CaregiverAssignmentList: () => <div>Shared caregiver finder</div>,
}))
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
  jest.mocked(readManagerVisitEditAction).mockClear()
  jest.mocked(readVisitCorrectionHistoryAction).mockClear()
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
  expect(readManagerVisitEditAction).not.toHaveBeenCalled()
  expect(readVisitCorrectionHistoryAction).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Close visit details' })).toHaveFocus()
  expect(screen.getByRole('tabpanel', { name: 'Overview' })).toHaveTextContent('Meal Preparation')
  expect(screen.getByRole('tab', { name: 'Tasks' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }))
  expect(screen.getByRole('tabpanel', { name: 'Tasks' })).toHaveTextContent('Meal Preparation')
  await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'History' })) })
  expect(readVisitCorrectionHistoryAction).toHaveBeenCalledWith('80000000-0000-4000-8000-000000000001')
  expect(screen.getByRole('tabpanel', { name: 'History' })).toHaveTextContent('No corrections recorded.')
})

test('manager actions use scoped pencil editors instead of a competing action menu or global edit mode', async () => {
  renderList(visit('unassigned'))
  expect(screen.queryByRole('button', { name: /Actions for Synthetic Client/i })).not.toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Visit actions' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit Visit' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit visit status' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit caregiver assignment' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit visit schedule' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit visit location' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View or edit recorded time' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Advertise Shift' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel Visit' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close visit details' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Close$/ })).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Edit visit schedule' })) })
  expect(screen.getByRole('dialog', { name: 'Edit Visit Schedule' })).toBeInTheDocument()
  expect(screen.getByText(/changes only this visit occurrence/i)).toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: /Visit location/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit location' }))
  expect(screen.getByRole('dialog', { name: 'Edit Visit Location' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: /Visit location/i })).toHaveValue('80000000-0000-4000-8000-000000000010')
  expect(screen.getByRole('option', { name: /Home \(Primary\).*Synthetic Way/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
})

test('authorized manager retains retryable scoped edit actions when the initial editor read fails', async () => {
  jest.mocked(readManagerVisitEditAction).mockClear()
  jest.mocked(readManagerVisitEditAction).mockResolvedValueOnce({ data: null, error: 'Editor temporarily unavailable.' })
  renderList(visit('unassigned'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  const editButton = screen.getByRole('button', { name: 'Edit visit schedule' })
  expect(editButton).toBeEnabled()
  await act(async () => { fireEvent.click(editButton) })
  expect(screen.queryByRole('dialog', { name: 'Edit Visit Schedule' })).not.toBeInTheDocument()
  expect(editButton).toBeEnabled()
  await act(async () => { fireEvent.click(editButton) })
  expect(screen.getByRole('dialog', { name: 'Edit Visit Schedule' })).toBeInTheDocument()
  expect(readManagerVisitEditAction).toHaveBeenCalledTimes(2)
})

test('caregiver editing loads and reuses the shared caregiver finder on demand', async () => {
  jest.mocked(getCaregiverCandidatesForVisitAction).mockClear()
  renderList(visit('unassigned'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(getCaregiverCandidatesForVisitAction).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Edit caregiver assignment' })) })
  expect(screen.getByRole('dialog', { name: 'Assign or Reassign Caregiver' })).toBeInTheDocument()
  expect(screen.getByText('Shared caregiver finder')).toBeInTheDocument()
  expect(getCaregiverCandidatesForVisitAction).toHaveBeenCalledWith('80000000-0000-4000-8000-000000000001')
})

test('time editing shows the assigned caregiver read-only and does not load assignment candidates', async () => {
  jest.mocked(getCaregiverCandidatesForVisitAction).mockClear()
  jest.mocked(readManagerVisitEditAction).mockResolvedValueOnce({ data: {
    scheduledVisitId: '80000000-0000-4000-8000-000000000001',
    updatedAt: '2099-10-01T12:00:00.000Z',
    patientAddressId: '80000000-0000-4000-8000-000000000010',
    visitLocations: [{ id: '80000000-0000-4000-8000-000000000010', label: 'Home (Primary)', displayAddress: '1 Synthetic Way, Test City, CA 92056' }],
    visitDate: '2099-10-28', scheduledEndDate: '2099-10-28',
    scheduledStartTime: '09:00', scheduledEndTime: '10:00',
    caregiverMemberId: 'caregiver-1', caregiverName: 'Caregiver Example', status: 'scheduled',
    visitTimezone: 'America/Los_Angeles', actualStartAt: '2099-10-28T16:00:00.000Z',
    actualEndAt: '2099-10-28T17:00:00.000Z', actualHours: 1,
    timeSource: 'manager_entered', financialStatus: null,
  } })
  renderList(visit('scheduled', 'Caregiver Example'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'View or edit recorded time' })) })
  expect(screen.getByRole('dialog', { name: 'Record or Edit Visit Time' })).toHaveTextContent('Caregiver Example')
  expect(screen.getByRole('dialog', { name: 'Record or Edit Visit Time' })).toHaveTextContent('Pacific Time')
  expect(screen.getByRole('dialog', { name: 'Record or Edit Visit Time' })).toHaveTextContent('1.00 hours')
  expect(screen.queryByRole('combobox', { name: /time zone/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('spinbutton', { name: /billable/i })).not.toBeInTheDocument()
  expect(screen.queryByText('Shared caregiver finder')).not.toBeInTheDocument()
  expect(getCaregiverCandidatesForVisitAction).not.toHaveBeenCalled()
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

test('completed visits retain scoped editing without cancellation', async () => {
  renderList({ ...visit('completed', 'Caregiver Example'), statusLabel: 'Completed' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(screen.getByRole('button', { name: 'Edit visit status' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View or edit recorded time' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cancel Visit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Visit actions' })).not.toBeInTheDocument()
})

test('a viewer does not see manager visit actions', async () => {
  renderList(visit('scheduled', 'Caregiver Example'), false)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(screen.queryByRole('button', { name: 'Edit visit status' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit caregiver assignment' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit visit schedule' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit visit location' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /visit time/i })).not.toBeInTheDocument()
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
