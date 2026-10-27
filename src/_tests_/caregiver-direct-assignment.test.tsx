import { fireEvent, render, screen } from '@testing-library/react'
import { CaregiverAssignmentList } from '@/components/CaregiverAssignmentList'
import { computeCaregiverMatches, type CaregiverMatchOption } from '@/lib/caregiver-matching'

const staff = [{ id: 'caregiver-1', first_name: 'Synthetic', last_name: 'Caregiver', skills: [] }]
const visit = {
  staff,
  slots: [],
  requiredSkills: ['Required Skill'],
  visitDate: '2026-10-26',
  visitStart: '09:00',
  visitEnd: '13:00',
}

describe('direct caregiver assignment', () => {
  test('a caregiver without a saved availability slot is selectable unless another visit overlaps', () => {
    const [free] = computeCaregiverMatches({ ...visit, conflicts: [] })
    const [booked] = computeCaregiverMatches({
      ...visit,
      conflicts: [{ id: 'other-visit', caregiver_id: staff[0].id, start_time: '11:00', end_time: '12:00' }],
    })
    expect(free.availability).toBe('blocked')
    expect(booked.availability).toBe('booked')

    const onSelect = jest.fn()
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
    try {
      render(<CaregiverAssignmentList assignmentMode="direct" variant="modal" options={[free] as CaregiverMatchOption[]}
        requiredSkills={visit.requiredSkills} defaultFilter="eligible" onSelect={onSelect} />)
      expect(screen.getByRole('button', { name: 'Assignable (1)' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Required Skill'))
      expect(onSelect).toHaveBeenCalledWith(staff[0].id)
    } finally {
      confirm.mockRestore()
    }
  })

  test('declining the missing-skill warning cancels the selection; booked caregivers stay disabled', () => {
    const [free] = computeCaregiverMatches({ ...visit, conflicts: [] })
    const [booked] = computeCaregiverMatches({
      ...visit,
      conflicts: [{ id: 'other-visit', caregiver_id: staff[0].id, start_time: '11:00', end_time: '12:00' }],
    })
    const onSelect = jest.fn()
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    try {
      const { rerender } = render(<CaregiverAssignmentList assignmentMode="direct" variant="modal" options={[free]}
        requiredSkills={visit.requiredSkills} defaultFilter="eligible" onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
      expect(onSelect).not.toHaveBeenCalled()
      rerender(<CaregiverAssignmentList assignmentMode="direct" variant="modal" options={[booked]}
        requiredSkills={visit.requiredSkills} defaultFilter="eligible" onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('button', { name: 'All (1)' }))
      expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled()
    } finally {
      confirm.mockRestore()
    }
  })

  test('modal keeps requirements and scoring collapsed while showing accurate row status', () => {
    const [candidate] = computeCaregiverMatches({ ...visit, conflicts: [] })
    render(<CaregiverAssignmentList assignmentMode="direct" variant="modal" options={[candidate]}
      requiredSkills={visit.requiredSkills} defaultFilter="all" onSelect={jest.fn()} />)

    expect(screen.getByRole('button', { name: 'Client Required Skills (1)' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Overall Score')).not.toBeInTheDocument()
    expect(screen.getByText('No matching availability')).toBeInTheDocument()
    expect(screen.getByText('Required skills 0 of 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Show details for Synthetic Caregiver' }))
    expect(screen.getByText('Overall Score')).toBeInTheDocument()
    expect(screen.getByText('Missing required skills (1)')).toBeInTheDocument()
    expect(screen.getByText('Required Skill')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Client Required Skills (1)' }))
    expect(screen.getByRole('button', { name: 'Client Required Skills (1)' })).toHaveAttribute('aria-expanded', 'true')
  })

  test('search narrows modal results and availability counts without changing assignment rules', () => {
    const [candidate] = computeCaregiverMatches({ ...visit, conflicts: [] })
    const other = { ...candidate, id: 'caregiver-2', name: 'Second Caregiver', title: 'Nurse' }
    render(<CaregiverAssignmentList assignmentMode="direct" variant="modal" options={[candidate, other]}
      requiredSkills={visit.requiredSkills} defaultFilter="all" onSelect={jest.fn()} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search caregivers by name or role' }), { target: { value: 'Nurse' } })
    expect(screen.queryByText('Synthetic Caregiver')).not.toBeInTheDocument()
    expect(screen.getByText('Second Caregiver')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All (1)' })).toBeInTheDocument()
  })
})
