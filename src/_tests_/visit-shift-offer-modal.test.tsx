import { fireEvent, render, screen } from '@testing-library/react'
import VisitShiftOfferModal from '@/components/VisitShiftOfferModal'
import type { CaregiverMatchOption } from '@/lib/caregiver-matching'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'

jest.mock('@/app/actions/visit-shift-offers', () => ({
  publishVisitShiftOfferAction: jest.fn(),
}))

jest.mock('@/components/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}))

function candidate(
  id: string,
  name: string,
  availability: CaregiverMatchOption['availability'],
  preferredSkillMatchPercent: number
): CaregiverMatchOption {
  return {
    id,
    name,
    title: 'Caregiver',
    phone: '',
    availability,
    distanceMiles: 5,
    distanceLabel: '5.00 mi',
    skillMatchPercent: 100,
    preferredSkillMatchPercent,
    proximityPercent: 88,
    overallPercent: 90,
    matchedSkills: [],
    matchedPreferredSkills: preferredSkillMatchPercent === 100 ? ['AED Certified'] : [],
    isCurrent: false,
  }
}

const visit = {
  id: '10000000-0000-4000-8000-000000000001',
  dateLabel: 'Wednesday, October 21, 2026',
  timeLabel: '12:00 AM - 1:30 AM',
  typeLabel: 'Routine',
  clientRequiredSkills: [],
  clientPreferredSkills: ['AED Certified'],
} as unknown as AllVisitCardDTO

describe('VisitShiftOfferModal candidate visibility', () => {
  test('shows every active candidate while restricting selection to eligible caregivers', () => {
    render(
      <VisitShiftOfferModal
        visit={visit}
        candidates={[
          candidate('20000000-0000-4000-8000-000000000001', 'Available Preferred Miss', 'available', 0),
          candidate('20000000-0000-4000-8000-000000000002', 'Booked Preferred Match', 'booked', 100),
          candidate('20000000-0000-4000-8000-000000000003', 'Unavailable Caregiver', 'blocked', 0),
        ]}
        isLoadingCandidates={false}
        onClose={jest.fn()}
        onPublished={jest.fn()}
      />
    )

    expect(screen.getByText('All eligible caregivers (1)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eligible (1)' })).toHaveClass('font-semibold')
    expect(screen.getByText('Available Preferred Miss')).toBeInTheDocument()
    expect(screen.queryByText('Booked Preferred Match')).not.toBeInTheDocument()
    expect(screen.queryByText('Unavailable Caregiver')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Select' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'All (3)' }))
    expect(screen.getByText('Available Preferred Miss')).toBeInTheDocument()
    expect(screen.getByText('Booked Preferred Match')).toBeInTheDocument()
    expect(screen.getByText('Unavailable Caregiver')).toBeInTheDocument()

    const selectButtons = screen.getAllByRole('button', { name: 'Select' })
    expect(selectButtons[0]).toBeEnabled()
    expect(selectButtons[1]).toBeDisabled()
    expect(selectButtons[2]).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Booked (1)' }))
    expect(screen.queryByText('Available Preferred Miss')).not.toBeInTheDocument()
    expect(screen.getByText('Booked Preferred Match')).toBeInTheDocument()
    expect(screen.queryByText('Unavailable Caregiver')).not.toBeInTheDocument()
  })
})
