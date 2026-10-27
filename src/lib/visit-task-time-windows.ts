/** Half-open local wall-clock windows for care-plan task scheduling and visit preselection. */
export const VISIT_TASK_TIME_WINDOWS = [
  { key: 'morning', label: 'Morning', range: '5 AM - 11 AM', slotKey: 'slotMorning', intervals: [[5 * 60, 11 * 60]] },
  { key: 'afternoon', label: 'Afternoon', range: '11 AM - 5 PM', slotKey: 'slotAfternoon', intervals: [[11 * 60, 17 * 60]] },
  { key: 'evening', label: 'Evening', range: '5 PM - 11 PM', slotKey: 'slotEvening', intervals: [[17 * 60, 23 * 60]] },
  { key: 'night', label: 'Night', range: '11 PM - 5 AM', slotKey: 'slotNight', intervals: [[0, 5 * 60], [23 * 60, 24 * 60]] },
] as const

export type VisitTaskTimeSlot = (typeof VISIT_TASK_TIME_WINDOWS)[number]['key']
