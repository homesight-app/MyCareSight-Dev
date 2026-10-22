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

/** An Anytime task is assigned once; the optional final segment snapshots its daily frequency. */
export function visitTaskAnytimeFrequency(raw: unknown): number | null {
  const value = String(raw ?? '').trim()
  const parts = value.split('::')
  if (parts[0]?.toLowerCase() !== 'any' || parts.length < 2) return null
  const frequency = parts.length === 3 ? Number(parts[2]) : 1
  return Number.isInteger(frequency) && frequency >= 1 && frequency <= 4 ? frequency : 1
}

/** Frequency is display metadata, not part of the task's assignment identity. */
export function visitTaskAssignmentKey(raw: string): string {
  return visitTaskAnytimeFrequency(raw) === null ? raw : `any::${extractVisitTaskToken(raw)}`
}

export function formatVisitTaskName(name: string, raw: string): string {
  const frequency = visitTaskAnytimeFrequency(raw)
  return frequency === null ? name : `${name} · Anytime ${frequency}×`
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

