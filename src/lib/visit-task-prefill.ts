import { encodeVisitAnytimeOccurrence, isVisitTaskAssigned, visitTaskAssignmentKey } from '@/lib/visit-task-codes'
import { VISIT_TASK_TIME_WINDOWS, type VisitTaskTimeSlot } from '@/lib/visit-task-time-windows'

type Slot = VisitTaskTimeSlot

type DayTaskSchedule = {
  schedule_type: 'never' | 'always' | 'as_needed' | 'specific_times'
  times_per_day: number | null
  slot_morning: string | null
  slot_afternoon: string | null
  slot_evening: string | null
  slot_night: string | null
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
  const visitIntervals: Array<readonly [number, number]> = end > start
    ? [[start, end]]
    : [[start, 24 * 60], [0, end]]
  const selected = new Set<Slot>()
  for (const { key, intervals } of VISIT_TASK_TIME_WINDOWS) {
    if (intervals.some(([windowStart, windowEnd]) =>
      visitIntervals.some(([visitStart, visitEnd]) => visitStart < windowEnd && visitEnd > windowStart)
    )) selected.add(key)
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
      const legacyKey = `any::${code}`
      if (assignedKeys.has(legacyKey)) continue
      if (frequency > 1) {
        for (let ordinal = 1; ordinal <= frequency; ordinal++) {
          const token = encodeVisitAnytimeOccurrence(code, frequency, ordinal)
          if (!isVisitTaskAssigned(assignedKeys, token)) tokens.push(token)
        }
      } else if (!isVisitTaskAssigned(assignedKeys, legacyKey)) {
        tokens.push(legacyKey)
      }
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
