'use client'

import { useMemo, useState } from 'react'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'
import type { VisitStatus } from '@/lib/visit-status'
import { todayPacificDate } from '@/lib/pct-week-horizon'
import { calendarClientRows, calendarDayLabel, calendarWeekDates } from '@/lib/visit-week-calendar'
import { formatVisitTime } from '@/lib/visit-time-display'

type Props = {
  visits: AllVisitCardDTO[]
  startDate: string
  onOpenVisit: (visit: AllVisitCardDTO) => void
}

function cardStyle(status: VisitStatus): { border: string; surface: string; dot: string } {
  if (status === 'completed') return { border: 'border-l-emerald-500', surface: 'bg-emerald-50/60', dot: 'bg-emerald-600' }
  if (status === 'missed') return { border: 'border-l-rose-400', surface: 'bg-rose-50/60', dot: 'bg-rose-500' }
  if (status === 'on_hold') return { border: 'border-l-amber-400', surface: 'bg-amber-50/60', dot: 'bg-amber-500' }
  if (status === 'in_progress') return { border: 'border-l-blue-500', surface: 'bg-blue-50/60', dot: 'bg-blue-600' }
  return { border: 'border-l-slate-400', surface: 'bg-slate-50', dot: 'bg-slate-500' }
}

export default function VisitWeeklyCalendar({ visits, startDate, onOpenVisit }: Props) {
  const dates = useMemo(() => calendarWeekDates(startDate), [startDate])
  const clients = useMemo(() => calendarClientRows(visits, startDate), [visits, startDate])
  const [expandedCells, setExpandedCells] = useState<Set<string>>(() => new Set())
  const today = todayPacificDate()

  const toggleCell = (key: string) => {
    setExpandedCells(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (clients.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-600">No visits in this week for the current filters.</div>
  }

  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-white" role="region" aria-label="Client weekly visit calendar" tabIndex={0}>
      <table className="w-full min-w-[1170px] table-fixed border-collapse text-left">
        <colgroup><col className="w-[190px]" />{dates.map(date => <col key={date} className="w-[140px]" />)}</colgroup>
        <thead className="sticky top-0 z-20 bg-white shadow-sm">
          <tr>
            <th scope="col" className="sticky left-0 z-30 border-b border-r border-gray-200 bg-white px-3 py-3 text-xs font-semibold text-gray-700">Client</th>
            {dates.map(date => {
              const label = calendarDayLabel(date)
              const isToday = date === today
              return <th key={date} scope="col" className={`border-b border-r border-gray-200 px-2 py-2 text-center text-xs font-semibold ${isToday ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700'}`}>
                <time dateTime={date}><span className="block">{label.weekday} {label.day}</span><span className="block text-[11px] font-normal">{label.month}</span></time>
              </th>
            })}
          </tr>
        </thead>
        <tbody>
          {clients.map(client => <tr key={client.clientId}>
            <th scope="row" className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white px-3 py-3 align-top text-left">
              <span className="block truncate text-sm font-semibold text-gray-900" title={client.clientName}>{client.clientName}</span>
              <span className="block truncate text-xs font-normal text-gray-500" title={client.locationLabel}>{client.locationLabel}</span>
              <span className="mt-1 block text-[11px] font-normal text-gray-500">{client.visitCount} visit{client.visitCount === 1 ? '' : 's'} this week</span>
            </th>
            {dates.map(date => {
              const cellKey = `${client.clientId}:${date}`
              const dayVisits = client.visitsByDate.get(date) ?? []
              const expanded = expandedCells.has(cellKey)
              const visible = expanded ? dayVisits : dayVisits.slice(0, 2)
              return <td key={date} className={`border-b border-r border-gray-200 p-1.5 align-top ${date === today ? 'bg-blue-50/40' : ''}`}>
                {visible.length === 0 ? <span className="block py-3 text-center text-xs text-gray-400">—</span> : (
                  <div className="space-y-1.5">
                    {visible.map(visit => {
                      const style = cardStyle(visit.status)
                      const task = visit.adlTasks.join(', ') || 'Care visit'
                      return <button key={visit.id} type="button" onClick={() => onOpenVisit(visit)}
                        aria-label={`${formatVisitTime(visit.timeLabel.split(' - ')[0]) || 'Time not set'}, ${task}, ${visit.status === 'unassigned' ? 'Scheduled' : visit.statusLabel}${visit.caregiverId ? '' : ', unassigned'}. View visit details for ${client.clientName}`}
                        className={`block w-full rounded-md border border-gray-100 border-l-[3px] p-1.5 text-left transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 ${style.border} ${style.surface}`}>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-900"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />{formatVisitTime(visit.timeLabel.split(' - ')[0]) || 'Time not set'}</span>
                        <span className="block truncate pl-2.5 text-[11px] text-gray-700" title={task}>{task}</span>
                        {!visit.caregiverId ? <span className="block pl-2.5 text-[10px] text-amber-700">Unassigned</span> : null}
                      </button>
                    })}
                    {dayVisits.length > 2 ? <button type="button" onClick={() => toggleCell(cellKey)} aria-expanded={expanded}
                      aria-label={expanded ? `Show fewer visits for ${client.clientName} on ${date}` : `Show ${dayVisits.length - 2} more visits for ${client.clientName} on ${date}`}
                      className="rounded px-1 text-xs font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600">
                      {expanded ? 'Show less' : `+${dayVisits.length - 2} more`}
                    </button> : null}
                  </div>
                )}
              </td>
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
  )
}
