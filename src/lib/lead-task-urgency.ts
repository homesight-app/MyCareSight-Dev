export type LeadTaskUrgency = 'overdue' | 'today'

type LeadTaskDueRow = {
  lead_id: string
  due_date: string
}

export function buildLeadTaskUrgencyMap(
  rows: LeadTaskDueRow[],
  today: string,
): Record<string, LeadTaskUrgency> {
  const urgency: Record<string, LeadTaskUrgency> = {}

  for (const row of rows) {
    if (!row.lead_id || !row.due_date || urgency[row.lead_id] === 'overdue') continue
    urgency[row.lead_id] = row.due_date < today ? 'overdue' : 'today'
  }

  return urgency
}
