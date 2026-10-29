import { addCalendarDays } from '@/lib/pct-week-horizon'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'

export type VisitCalendarClientRow = {
  clientId: string
  clientName: string
  locationLabel: string
  visitCount: number
  visitsByDate: Map<string, AllVisitCardDTO[]>
}

export function calendarWeekDates(startDate: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(startDate, index))
}

/** Build one client row per client with visits in the selected seven-day span. */
export function calendarClientRows(visits: AllVisitCardDTO[], startDate: string): VisitCalendarClientRow[] {
  const endDate = addCalendarDays(startDate, 6)
  const byClient = new Map<string, VisitCalendarClientRow>()
  for (const visit of visits) {
    if (visit.date < startDate || visit.date > endDate) continue
    let row = byClient.get(visit.clientId)
    if (!row) {
      row = {
        clientId: visit.clientId,
        clientName: visit.clientName,
        locationLabel: visit.locationLabel,
        visitCount: 0,
        visitsByDate: new Map(),
      }
      byClient.set(visit.clientId, row)
    }
    const day = row.visitsByDate.get(visit.date) ?? []
    day.push(visit)
    row.visitsByDate.set(visit.date, day)
    row.visitCount += 1
  }
  return [...byClient.values()]
    .map(row => {
      for (const day of row.visitsByDate.values()) day.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel) || a.id.localeCompare(b.id))
      return row
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' }) || a.clientId.localeCompare(b.clientId))
}

function utcCalendarDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`)
}

export function calendarDayLabel(date: string): { weekday: string; day: string; month: string } {
  const value = utcCalendarDate(date)
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(value),
    day: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }).format(value),
    month: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(value),
  }
}

export function calendarRangeLabel(startDate: string): string {
  const endDate = addCalendarDays(startDate, 6)
  const start = utcCalendarDate(startDate)
  const end = utcCalendarDate(endDate)
  const monthDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
  const ending = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
  return `${monthDay.format(start)} – ${ending.format(end)}`
}
