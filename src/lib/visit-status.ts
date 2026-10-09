/** Canonical scheduled-visit lifecycle values shared by manager and caregiver views. */
export const VISIT_STATUS_VALUES = [
  'completed',
  'missed',
  'cancelled',
  'voided',
  'on_hold',
  'in_progress',
  'scheduled',
  'unassigned',
] as const

export type VisitStatus = (typeof VISIT_STATUS_VALUES)[number]

export function visitStatusFromScheduleRow(row: {
  status?: string | null
  caregiver_id?: string | null
}): VisitStatus {
  const raw = String(row.status ?? '').toLowerCase().trim().replaceAll(' ', '_')
  if ((VISIT_STATUS_VALUES as readonly string[]).includes(raw)) return raw as VisitStatus
  return row.caregiver_id ? 'scheduled' : 'unassigned'
}

export function visitStatusLabel(status: VisitStatus): string {
  if (status === 'in_progress') return 'In Progress'
  if (status === 'on_hold') return 'On Hold'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function canCaregiverStartVisit(status: VisitStatus): boolean {
  return status === 'scheduled' || status === 'in_progress'
}

export function canCaregiverEditVisitExecution(status: VisitStatus): boolean {
  return status === 'in_progress'
}

export function isVisitTerminal(status: VisitStatus): boolean {
  return status === 'completed' || status === 'missed' || status === 'cancelled' || status === 'voided'
}
