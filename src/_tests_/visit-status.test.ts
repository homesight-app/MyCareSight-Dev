import {
  canCaregiverEditVisitExecution,
  canCaregiverStartVisit,
  isVisitTerminal,
  visitStatusFromScheduleRow,
  visitStatusForScheduleCalendar,
} from '@/lib/visit-status'
import {
  canCaregiverActOnVisit,
  caregiverVisitDisclosure,
  getCaregiverVisitDateRange,
  isVisitPastForCaregiverMyVisits,
} from '@/lib/caregiver-care-visits-shared'

describe('scheduled visit lifecycle', () => {
  it('shows a future unassigned visit as upcoming when an automatic status was premature', () => {
    expect(visitStatusForScheduleCalendar({
      status: 'missed', caregiver_id: null, date: '2026-10-28',
      start_time: '16:00', end_time: '17:00',
    }, new Date('2026-10-28T12:48:00'))).toBe('unassigned')
  })

  it('keeps a deliberate missed decision and holds intact', () => {
    const future = { date: '2026-10-28', start_time: '16:00', end_time: '17:00' }
    const now = new Date('2026-10-28T12:48:00')
    expect(visitStatusForScheduleCalendar({ ...future, status: 'missed', status_reason: 'Confirmed no show' }, now)).toBe('missed')
    expect(visitStatusForScheduleCalendar({ ...future, status: 'on_hold' }, now)).toBe('on_hold')
  })

  it('waits until an overnight visit ends before calling it missed', () => {
    const row = { date: '2026-10-28', start_time: '23:00', end_time: '01:00', status: 'scheduled' }
    expect(visitStatusForScheduleCalendar(row, new Date('2026-10-29T00:30:00'))).toBe('scheduled')
    expect(visitStatusForScheduleCalendar(row, new Date('2026-10-29T01:30:00'))).toBe('missed')
  })

  it.each(['cancelled', 'voided', 'on_hold'] as const)(
    'preserves %s instead of converting it to an assigned caregiver visit',
    status => {
      expect(visitStatusFromScheduleRow({ status, caregiver_id: 'caregiver-1' })).toBe(status)
    }
  )

  it('falls back according to assignment only for unknown legacy values', () => {
    expect(visitStatusFromScheduleRow({ status: 'legacy', caregiver_id: 'caregiver-1' })).toBe('scheduled')
    expect(visitStatusFromScheduleRow({ status: 'legacy', caregiver_id: null })).toBe('unassigned')
  })

  it.each(['cancelled', 'voided', 'on_hold', 'completed', 'missed'] as const)(
    'blocks caregiver execution for %s visits',
    status => {
      expect(canCaregiverStartVisit(status)).toBe(false)
      expect(canCaregiverEditVisitExecution(status)).toBe(false)
    }
  )

  it('allows clock-in for scheduled visits and edits only while in progress', () => {
    expect(canCaregiverStartVisit('scheduled')).toBe(true)
    expect(canCaregiverStartVisit('in_progress')).toBe(true)
    expect(canCaregiverEditVisitExecution('scheduled')).toBe(false)
    expect(canCaregiverEditVisitExecution('in_progress')).toBe(true)
  })

  it('treats cancellation and voiding as terminal while an on-hold visit remains visible', () => {
    expect(isVisitTerminal('cancelled')).toBe(true)
    expect(isVisitTerminal('voided')).toBe(true)
    expect(isVisitTerminal('on_hold')).toBe(false)
    expect(isVisitPastForCaregiverMyVisits({ date: '2999-01-01', status: 'cancelled' })).toBe(true)
    expect(isVisitPastForCaregiverMyVisits({ date: '2999-01-01', status: 'voided' })).toBe(true)
    expect(isVisitPastForCaregiverMyVisits({ date: '2999-01-01', status: 'on_hold' })).toBe(false)
    expect(canCaregiverActOnVisit('on_hold')).toBe(false)
  })

  it('uses a bounded caregiver visit window', () => {
    expect(getCaregiverVisitDateRange(new Date('2026-10-08T12:00:00Z'))).toEqual({
      startDate: '2026-08-09',
      endDate: '2027-02-05',
    })
  })

  it('redacts client PHI and task details before an open visit reaches the browser', () => {
    expect(caregiverVisitDisclosure(false, {
      clientName: 'Synthetic Client',
      locationLine: '123 Test Street',
      locationShort: 'Test City, CA',
      adlTasks: ['Bathing'],
      notes: 'Synthetic note',
    })).toEqual({
      clientName: 'Open visit',
      locationLine: '-',
      locationShort: 'Location available after assignment',
      adlTasks: [],
      notes: null,
    })
  })
})
