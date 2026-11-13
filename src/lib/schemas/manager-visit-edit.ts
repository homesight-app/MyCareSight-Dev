import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time.')
const optionalLocalDateTime = z.string().trim().refine(
  value => value === '' || /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value),
  'Enter a valid date and time.'
)

export const supportedVisitTimezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
] as const

export const managerEditableVisitStatuses = [
  'scheduled', 'in_progress', 'completed', 'missed', 'on_hold',
] as const

export const managerVisitEditSchema = z.object({
  scheduledVisitId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  visitDate: date,
  scheduledEndDate: date,
  scheduledStartTime: time,
  scheduledEndTime: time,
  caregiverMemberId: z.string(),
  status: z.enum(managerEditableVisitStatuses),
  visitTimezone: z.union([z.enum(supportedVisitTimezones), z.literal('')]),
  actualStartAt: optionalLocalDateTime,
  actualEndAt: optionalLocalDateTime,
  billableHours: z.number().finite().min(0).max(744),
  changeNote: z.string().trim().min(10, 'Explain the change in at least 10 characters.').max(2000),
  careVerified: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const scheduledStart = Date.parse(`${value.visitDate}T${value.scheduledStartTime}:00`)
  const scheduledEnd = Date.parse(`${value.scheduledEndDate}T${value.scheduledEndTime}:00`)
  if (!(scheduledEnd > scheduledStart)) {
    ctx.addIssue({ code: 'custom', path: ['scheduledEndTime'], message: 'Scheduled end must follow scheduled start.' })
  }

  const hasStart = value.actualStartAt !== ''
  const hasEnd = value.actualEndAt !== ''
  if (hasEnd && !hasStart) {
    ctx.addIssue({ code: 'custom', path: ['actualStartAt'], message: 'Enter an actual start before the actual end.' })
  }
  if (hasStart && hasEnd && value.actualEndAt <= value.actualStartAt) {
    ctx.addIssue({ code: 'custom', path: ['actualEndAt'], message: 'Actual end must follow actual start.' })
  }
  if ((hasStart || hasEnd) && !value.visitTimezone) {
    ctx.addIssue({ code: 'custom', path: ['visitTimezone'], message: 'Select the visit location time zone.' })
  }
  if ((hasStart || hasEnd || value.status === 'in_progress' || value.status === 'completed') && !value.caregiverMemberId) {
    ctx.addIssue({ code: 'custom', path: ['caregiverMemberId'], message: 'Assign the caregiver who performed the visit.' })
  }
  if (value.status === 'in_progress' && (!hasStart || hasEnd)) {
    ctx.addIssue({ code: 'custom', path: ['actualStartAt'], message: 'An in-progress visit needs a start time and no end time.' })
  }
  if (value.status === 'completed' && (!hasStart || !hasEnd)) {
    ctx.addIssue({ code: 'custom', path: ['actualEndAt'], message: 'A completed visit needs actual start and end times.' })
  }
  if (hasStart && hasEnd && value.status !== 'completed') {
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'A visit with actual start and end times must be completed.' })
  }
  if ((hasStart || hasEnd) && !value.careVerified) {
    ctx.addIssue({ code: 'custom', path: ['careVerified'], message: 'Confirm that the recorded time was verified.' })
  }
  if (['scheduled', 'missed', 'on_hold'].includes(value.status) && (hasStart || hasEnd)) {
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'Recorded time is only valid for an in-progress or completed visit.' })
  }
})

export type ManagerVisitEditInput = z.input<typeof managerVisitEditSchema>

export type ManagerVisitEditSnapshot = {
  scheduledVisitId: string
  updatedAt: string
  visitDate: string
  scheduledEndDate: string
  scheduledStartTime: string
  scheduledEndTime: string
  caregiverMemberId: string | null
  status: typeof managerEditableVisitStatuses[number]
  visitTimezone: typeof supportedVisitTimezones[number] | null
  actualStartAt: string | null
  actualEndAt: string | null
  billableHours: number
  timeSource: 'none' | 'caregiver' | 'manager_entered' | 'manager_adjusted'
  financialStatus: string | null
  caregivers: Array<{ id: string; name: string }>
}
