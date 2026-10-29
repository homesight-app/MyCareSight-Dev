import { fireEvent, render, screen } from '@testing-library/react'
import VisitWeeklyCalendar from '@/components/VisitWeeklyCalendar'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'
import { addCalendarDays, todayPacificDate } from '@/lib/pct-week-horizon'
import { calendarClientRows, calendarRangeLabel, calendarWeekDates } from '@/lib/visit-week-calendar'

function syntheticVisit(id: string, clientId: string, clientName: string, date: string, timeLabel: string): AllVisitCardDTO {
  return {
    id, clientId, clientName, date, timeLabel, locationLabel: 'Test City, CA',
    dateLabel: date, visitTitle: 'Care visit', status: 'scheduled', statusLabel: 'Scheduled',
    correctionCount: 0, typeLabel: 'Routine', caregiverId: 'caregiver-1', caregiverName: 'Test Caregiver',
    adlTasks: ['Meal Preparation'], notes: null, statusReason: null, clientRequiredSkills: [],
    clientPreferredSkills: [], reassignCandidates: [], shiftOffer: null,
  }
}

test('weekly dates and labels cross a month without shifting visit dates', () => {
  expect(calendarWeekDates('2026-10-28')).toEqual([
    '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
    '2026-11-01', '2026-11-02', '2026-11-03',
  ])
  expect(calendarRangeLabel('2026-10-28')).toBe('Oct 28 – Nov 3, 2026')
})

test('clients sort alphabetically and multiple visits stay in one date cell', () => {
  const rows = calendarClientRows([
    syntheticVisit('3', 'b', 'Zeta Test', '2026-10-28', '11:00 - 12:00'),
    syntheticVisit('2', 'a', 'Alpha Test', '2026-10-28', '10:00 - 11:00'),
    syntheticVisit('1', 'a', 'Alpha Test', '2026-10-28', '09:00 - 10:00'),
    syntheticVisit('4', 'a', 'Alpha Test', '2026-11-05', '09:00 - 10:00'),
  ], '2026-10-28')
  expect(rows.map(row => row.clientName)).toEqual(['Alpha Test', 'Zeta Test'])
  expect(rows[0].visitsByDate.get('2026-10-28')?.map(visit => visit.id)).toEqual(['1', '2'])
  expect(rows[0].visitCount).toBe(2)
})

test('a cell reveals extra visits and every card opens its own visit', () => {
  const date = todayPacificDate()
  const visits = [
    syntheticVisit('1', 'a', 'Alpha Test', date, '09:00 - 10:00'),
    syntheticVisit('2', 'a', 'Alpha Test', date, '10:00 - 11:00'),
    syntheticVisit('3', 'a', 'Alpha Test', date, '11:00 - 12:00'),
    syntheticVisit('4', 'b', 'Beta Test', addCalendarDays(date, 1), '08:00 - 09:00'),
  ]
  const open = jest.fn()
  render(<VisitWeeklyCalendar visits={visits} startDate={date} onOpenVisit={open} />)
  expect(screen.getAllByRole('button', { name: /View visit details for Alpha Test/i })).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: /Show 1 more visits for Alpha Test/i }))
  const cards = screen.getAllByRole('button', { name: /View visit details for Alpha Test/i })
  expect(cards).toHaveLength(3)
  fireEvent.click(cards[2])
  expect(open).toHaveBeenCalledWith(visits[2])
  fireEvent.click(screen.getByRole('button', { name: /Show fewer visits for Alpha Test/i }))
  expect(screen.getAllByRole('button', { name: /View visit details for Alpha Test/i })).toHaveLength(2)
})
