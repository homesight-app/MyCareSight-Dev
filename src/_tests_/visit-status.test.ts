import {
  canCaregiverEditVisitExecution,
  canCaregiverStartVisit,
  isVisitTerminal,
  visitStatusFromScheduleRow,
} from '@/lib/visit-status'
import {
  canCaregiverActOnVisit,
  caregiverVisitDisclosure,
  getCaregiverVisitDateRange,
  isVisitPastForCaregiverMyVisits,
} from '@/lib/caregiver-care-visits-shared'

describe('scheduled visit lifecycle', () => {
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
