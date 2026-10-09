import { visitStatusFromScheduleRow, type VisitStatus } from '@/lib/visit-status'

/** Same rules as deriveVisitStatus in visit-all-visits-dashboard (status + caregiver). */
export { visitStatusFromScheduleRow }

/** Tailwind classes for status pills — keep in sync with VisitManagementContent usage. */
export function visitStatusBadgeClass(status: VisitStatus): string {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (status === 'missed') return 'bg-orange-100 text-orange-700 border-orange-200'
  if (status === 'cancelled') return 'bg-rose-100 text-rose-700 border-rose-200'
  if (status === 'voided') return 'bg-slate-100 text-slate-700 border-slate-200'
  if (status === 'on_hold') return 'bg-yellow-100 text-yellow-700 border-yellow-200'
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700 border-blue-200'
  if (status === 'unassigned') return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

export function visitStatusLeftBorderClass(status: VisitStatus): string {
  if (status === 'completed') return 'border-l-emerald-500'
  if (status === 'missed') return 'border-l-orange-500'
  if (status === 'cancelled') return 'border-l-rose-500'
  if (status === 'voided') return 'border-l-slate-500'
  if (status === 'on_hold') return 'border-l-yellow-500'
  if (status === 'in_progress') return 'border-l-blue-500'
  if (status === 'unassigned') return 'border-l-red-500'
  return 'border-l-gray-400'
}
