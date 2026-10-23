import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import VisitCorrectionModal from '@/components/VisitCorrectionModal'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'

jest.mock('@/components/Modal', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const visit = {
  id: '70000000-0000-4000-8000-000000000001',
  dateLabel: 'Monday, October 19, 2026',
  status: 'missed',
  statusLabel: 'Missed',
  caregiverId: '70000000-0000-4000-8000-000000000002',
} as AllVisitCardDTO

test('manual completion requires verification and sends actual times for review', async () => {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true })
  render(<VisitCorrectionModal visit={visit}
    caregivers={[{ id: visit.caregiverId!, name: 'Synthetic Caregiver' }]}
    onSubmit={onSubmit} onClose={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))
  await waitFor(() => expect(screen.getByText('Confirm that care actually occurred.')).toBeInTheDocument())
  expect(onSubmit).not.toHaveBeenCalled()

  fireEvent.change(screen.getByLabelText(/Actual start/), { target: { value: '2026-10-19T09:00' } })
  fireEvent.change(screen.getByLabelText(/Actual end/), { target: { value: '2026-10-19T13:00' } })
  fireEvent.change(screen.getByLabelText(/Proposed billable hours/), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText(/Reason and verification source/), {
    target: { value: 'Synthetic caregiver and client confirmation.' },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: /I verified that this care occurred/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    expectedStatus: 'missed',
    correctedStatus: 'completed',
    caregiverMemberId: visit.caregiverId,
    billableHours: 4,
    careVerified: true,
  })))
  const input = onSubmit.mock.calls[0][0]
  expect(Date.parse(input.actualEndAt) - Date.parse(input.actualStartAt)).toBe(4 * 60 * 60 * 1000)
})
