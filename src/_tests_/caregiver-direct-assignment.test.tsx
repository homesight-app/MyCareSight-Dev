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
      expect(screen.getByRole('button', { name: 'Eligible (1)' })).toBeInTheDocument()
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
})
