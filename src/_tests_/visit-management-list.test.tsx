import { act, fireEvent, render, screen } from '@testing-library/react'
import VisitManagementContent from '@/components/VisitManagementContent'
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

test('visit actions live in the header menu and respect assignment state', async () => {
  renderList(visit('unassigned'))
  expect(screen.queryByRole('button', { name: /Actions for Synthetic Client/i })).not.toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close visit details' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Close$/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Visit actions' }))
  expect(screen.getByRole('menuitem', { name: 'Assign Caregiver' })).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'Unassign' })).not.toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Place On Hold' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Mark as Missed' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Cancel Visit' })).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
})

test('the drawer closes on Escape and assignment opens the existing modal', async () => {
  renderList(visit('unassigned'))
  const trigger = screen.getByRole('button', { name: /View visit details for Synthetic Client/i })
  await act(async () => { fireEvent.click(trigger) })
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Visit Details' })).not.toBeInTheDocument()
  await act(async () => { fireEvent.click(trigger) })
  fireEvent.click(screen.getByRole('button', { name: 'Visit actions' }))
  await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Assign Caregiver' })) })
  expect(screen.getByRole('dialog', { name: 'Assign Caregiver' })).toBeInTheDocument()
  expect(screen.getByText('Visit Details').closest('[role="dialog"]')).toHaveAttribute('aria-hidden', 'true')
  fireEvent.click(screen.getByRole('dialog', { name: 'Assign Caregiver' }).querySelector('button[aria-label="Close modal"]')!)
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
})

test('status actions open their existing reason dialog', async () => {
  renderList(visit('scheduled', 'Caregiver Example'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  fireEvent.click(screen.getByRole('button', { name: 'Visit actions' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as Missed' }))
  expect(screen.getByText('Visit Details').closest('[role="dialog"]')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('dialog', { name: 'Mark Visit as Missed' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
})

test('canceling Place On Hold returns to the same visit details', async () => {
  renderList(visit('scheduled', 'Caregiver Example'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  fireEvent.click(screen.getByRole('button', { name: 'Visit actions' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Place On Hold' }))
  expect(screen.getByRole('dialog', { name: 'Put Visit On Hold' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('dialog', { name: 'Visit Details' })).toBeInTheDocument()
  expect(screen.getByRole('tabpanel', { name: 'Overview' })).toHaveTextContent('Caregiver Example')
})

test('completed visits offer correction without scheduling changes', async () => {
  renderList({ ...visit('completed', 'Caregiver Example'), statusLabel: 'Completed' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  fireEvent.click(screen.getByRole('button', { name: 'Visit actions' }))
  expect(screen.getByRole('menuitem', { name: 'Correct Visit' })).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: /Assign Caregiver|Mark as Missed|Cancel Visit/i })).not.toBeInTheDocument()
})

test('a viewer does not see manager visit actions', async () => {
  renderList(visit('scheduled', 'Caregiver Example'), false)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View visit details for Synthetic Client/i })) })
  expect(screen.queryByRole('button', { name: 'Visit actions' })).not.toBeInTheDocument()
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
