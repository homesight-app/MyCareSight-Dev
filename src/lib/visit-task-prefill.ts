import { visitTaskAssignmentKey } from '@/lib/visit-task-codes'

type Slot = 'morning' | 'afternoon' | 'evening' | 'night'

type DayTaskSchedule = {
  schedule_type: 'never' | 'always' | 'as_needed' | 'specific_times'
  times_per_day: number | null
  slot_morning: string | null
  slot_afternoon: string | null
  slot_evening: string | null
  slot_night: string | null
}

const WINDOWS: Record<Slot, readonly (readonly [number, number])[]> = {
  morning: [[6 * 60, 12 * 60]],
  afternoon: [[12 * 60, 18 * 60]],
  evening: [[18 * 60, 22 * 60]],
  night: [[0, 5 * 60], [22 * 60, 24 * 60]],
}

function minutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}

export function visitOverlappingTaskSlots(startTime: string, endTime: string): Set<Slot> {
  const start = minutes(startTime)
  const end = minutes(endTime)
  if (start === null || end === null || start === end) return new Set()
  const intervals: Array<readonly [number, number]> = end > start
    ? [[start, end]]
    : [[start, 24 * 60], [0, end]]
  const selected = new Set<Slot>()
  for (const slot of Object.keys(WINDOWS) as Slot[]) {
    if (WINDOWS[slot].some(([windowStart, windowEnd]) =>
      intervals.some(([visitStart, visitEnd]) => visitStart < windowEnd && visitEnd > windowStart)
    )) selected.add(slot)
  }
  return selected
}

/** Uses the same slot identity as the Add Visit task list. */
export function suggestedVisitTaskTokens(
  tasks: ReadonlyArray<{ code: string; schedule: DayTaskSchedule | undefined }>,
  startTime: string,
  endTime: string,
  assignedKeys: ReadonlySet<string>
): string[] {
  const overlapping = visitOverlappingTaskSlots(startTime, endTime)
  const tokens: string[] = []
  for (const { code, schedule } of tasks) {
    if (!schedule) continue
    if (schedule.schedule_type === 'always') {
      const frequency = schedule.times_per_day ?? 1
      const token = frequency > 1 ? `any::${code}::${frequency}` : `any::${code}`
      if (!assignedKeys.has(visitTaskAssignmentKey(token))) tokens.push(token)
    } else if (schedule.schedule_type === 'specific_times') {
      for (const slot of overlapping) {
        if (schedule[`slot_${slot}`] !== 'always') continue
        const token = `${slot}::${code}`
        if (!assignedKeys.has(visitTaskAssignmentKey(token))) tokens.push(token)
      }
    }
  }
  return tokens
}
