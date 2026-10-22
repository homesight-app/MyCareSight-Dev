type CarePlanDay = { day_of_week: number; schedule_type: string }

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

export function allCarePlanDaysEnabled(rows: readonly CarePlanDay[]): boolean {
  return WEEKDAYS.every((day) => rows.some((row) => row.day_of_week === day && row.schedule_type !== 'never'))
}

/** Turn a full week off, or fill only disabled days while retaining customized active days. */
export function toggleCarePlanWeek<T extends CarePlanDay>(
  rows: readonly T[],
  buildRow: (day: number, existing: T | undefined, enabled: boolean) => T
): T[] {
  const enable = !allCarePlanDaysEnabled(rows)
  return WEEKDAYS.map((day) => {
    const existing = rows.find((row) => row.day_of_week === day)
    return enable && existing?.schedule_type !== 'never' && existing
      ? existing
      : buildRow(day, existing, enable)
  })
}
