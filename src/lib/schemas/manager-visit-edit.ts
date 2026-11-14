import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time.')
const localDateTime = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid date and time.')

export const supportedVisitTimezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
] as const

export const managerEditableVisitStatuses = ['scheduled', 'in_progress', 'completed', 'missed', 'on_hold'] as const
export const managerVisitEditScopes = ['schedule', 'location', 'caregiver', 'status', 'time'] as const
export type ManagerVisitEditScope = (typeof managerVisitEditScopes)[number]

const commandBase = {
  scheduledVisitId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  changeNote: z.string().trim().min(10, 'Explain the change in at least 10 characters.').max(2000),
}

export const managerVisitScheduleEditSchema = z.object({
  ...commandBase,
  scope: z.literal('schedule'),
  visitDate: date,
  scheduledEndDate: date,
  scheduledStartTime: time,
  scheduledEndTime: time,
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(`${value.visitDate}T${value.scheduledStartTime}:00`)
  const end = Date.parse(`${value.scheduledEndDate}T${value.scheduledEndTime}:00`)
  if (!(end > start)) ctx.addIssue({ code: 'custom', path: ['scheduledEndTime'], message: 'Scheduled end must follow scheduled start.' })
})

export const managerVisitLocationEditSchema = z.object({
  ...commandBase,
  scope: z.literal('location'),
  patientAddressId: z.uuid('Select a valid visit location.'),
}).strict()

export const managerVisitCaregiverEditSchema = z.object({
  ...commandBase,
  scope: z.literal('caregiver'),
  caregiverMemberId: z.string(),
}).strict()

export const managerVisitStatusEditSchema = z.object({
  ...commandBase,
  scope: z.literal('status'),
  status: z.enum(['scheduled', 'missed', 'on_hold']),
}).strict()

export const managerVisitTimeEditSchema = z.object({
  ...commandBase,
  scope: z.literal('time'),
  actualStartAt: localDateTime,
  actualEndAt: z.union([localDateTime, z.literal('')]),
  careVerified: z.boolean().refine(value => value, 'Confirm that the recorded time was verified.'),
}).strict().superRefine((value, ctx) => {
  if (value.actualEndAt && value.actualEndAt <= value.actualStartAt) {
    ctx.addIssue({ code: 'custom', path: ['actualEndAt'], message: 'Actual end must follow actual start.' })
  }
})

export const managerVisitEditSchema = z.discriminatedUnion('scope', [
  managerVisitScheduleEditSchema,
  managerVisitLocationEditSchema,
  managerVisitCaregiverEditSchema,
  managerVisitStatusEditSchema,
  managerVisitTimeEditSchema,
])

export type ManagerVisitScheduleEditInput = z.input<typeof managerVisitScheduleEditSchema>
export type ManagerVisitLocationEditInput = z.input<typeof managerVisitLocationEditSchema>
export type ManagerVisitCaregiverEditInput = z.input<typeof managerVisitCaregiverEditSchema>
export type ManagerVisitStatusEditInput = z.input<typeof managerVisitStatusEditSchema>
export type ManagerVisitTimeEditInput = z.input<typeof managerVisitTimeEditSchema>
export type ManagerVisitEditInput = z.input<typeof managerVisitEditSchema>

export type ManagerVisitEditSnapshot = {
  scheduledVisitId: string
  updatedAt: string
  patientAddressId: string | null
  visitLocations: Array<{
    id: string
    label: string
    displayAddress: string
  }>
  visitDate: string
  scheduledEndDate: string
  scheduledStartTime: string
  scheduledEndTime: string
  caregiverMemberId: string | null
  caregiverName: string | null
  status: typeof managerEditableVisitStatuses[number]
  visitTimezone: typeof supportedVisitTimezones[number] | null
  actualStartAt: string | null
  actualEndAt: string | null
  actualHours: number | null
  timeSource: 'none' | 'caregiver' | 'manager_entered' | 'manager_adjusted'
  financialStatus: string | null
}
