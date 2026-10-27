const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function extractVisitTaskToken(raw: unknown): string {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  const parts = value.split('::')
  return (parts.length > 1 ? parts[1] : parts[0]).trim()
}

export function visitTaskSlotKey(raw: unknown): string {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  const parts = value.split('::')
  return parts.length > 1 ? parts[0].trim().toLowerCase() : ''
}

/** Legacy combined assignments use `any::task::total`; individual assignments use `any::task::total::ordinal`. */
export function visitTaskAnytimeFrequency(raw: unknown): number | null {
  const value = String(raw ?? '').trim()
  const parts = value.split('::')
  if (parts[0]?.toLowerCase() !== 'any' || parts.length < 2) return null
  const frequency = parts.length >= 3 ? Number(parts[2]) : 1
  return Number.isInteger(frequency) && frequency >= 1 && frequency <= 4 ? frequency : 1
}

export function visitTaskAnytimeOccurrence(raw: unknown): { total: number; ordinal: number } | null {
  const parts = String(raw ?? '').trim().split('::')
  if (parts[0]?.toLowerCase() !== 'any' || parts.length !== 4) return null
  const total = Number(parts[2])
  const ordinal = Number(parts[3])
  if (!Number.isInteger(total) || total < 2 || total > 4 ||
      !Number.isInteger(ordinal) || ordinal < 1 || ordinal > total) return null
  return { total, ordinal }
}

export function encodeVisitAnytimeOccurrence(task: string, total: number, ordinal: number): string {
  return `any::${task}::${total}::${ordinal}`
}

/** The ordinal is the assignment identity; the total is display metadata. Legacy combined rows occupy the base key. */
export function visitTaskAssignmentKey(raw: string): string {
  const occurrence = visitTaskAnytimeOccurrence(raw)
  if (occurrence) return `any::${extractVisitTaskToken(raw)}::${occurrence.ordinal}`
  return visitTaskAnytimeFrequency(raw) === null ? raw : `any::${extractVisitTaskToken(raw)}`
}

export function isVisitTaskAssigned(assignedKeys: ReadonlySet<string>, token: string): boolean {
  const key = visitTaskAssignmentKey(token)
  if (assignedKeys.has(key)) return true
  if (visitTaskAnytimeOccurrence(token) && assignedKeys.has(`any::${extractVisitTaskToken(token)}`)) return true
  return key.startsWith('any::') && assignedKeys.has(`${key}::1`)
}

export function formatVisitTaskName(name: string, raw: string): string {
  const frequency = visitTaskAnytimeFrequency(raw)
  if (frequency === null) return name
  const occurrence = visitTaskAnytimeOccurrence(raw)
  return occurrence
    ? `${name} · Anytime ${occurrence.ordinal} of ${occurrence.total}`
    : `${name} · Anytime ${frequency}×`
}

export function isUuidToken(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

export function decodeVisitTaskCodes(
  codes: string[] | null | undefined,
  taskNameById?: ReadonlyMap<string, string>
): string[] {
  if (!Array.isArray(codes)) return []

  return codes
    .map((code) => {
      const token = extractVisitTaskToken(code)
      if (!token) return ''
      const mapped = taskNameById?.get(token)
      return formatVisitTaskName(mapped?.trim() || token, code)
    })
    .filter(Boolean)
}

